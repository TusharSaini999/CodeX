import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import crypto from 'crypto';
import connectDB from '../config/db.js';
import { CertificateBatch } from '../models/certificateBatch.model.js';
import { Certificate } from '../models/certificate.model.js';
import { BackgroundJob } from '../models/backgroundJob.model.js';
import { BoardingPass } from '../models/boardingPass.model.js';
import { generateQRCodeWithLogo } from '../utils/qrGenerator.js';
import { uploadOnCloudinary } from '../utils/cloudinary.js';

async function runRecovery() {
  console.log('🚀 Starting Certificate Recovery Process...');
  await connectDB();

  const targetBatchId = process.argv[2]; // Optional CLI argument: node recoverCertificates.js [batchId]
  const query = targetBatchId
    ? {
        $or: [
          { batchId: targetBatchId },
          { _id: mongoose.isValidObjectId(targetBatchId) ? targetBatchId : null },
        ].filter(Boolean),
      }
    : {};

  const batches = await CertificateBatch.find(query).sort({ createdAt: -1 });
  console.log(`📋 Found ${batches.length} batch(es) in database.`);

  let totalRestored = 0;

  for (const batch of batches) {
    console.log(`\n--------------------------------------------------`);
    console.log(`🔎 Batch: #${batch.batchId} | Event: "${batch.eventName}" | Date: ${batch.eventDate?.toISOString()?.slice(0, 10)}`);
    console.log(`   Status: ${batch.status} | Students in roster: ${batch.students?.length || 0} | Stored studentCount: ${batch.studentCount || 0}`);

    // If batch.students array is missing or empty, discover students from BackgroundJobs, Certificates, or BoardingPasses
    if (!batch.students || batch.students.length === 0) {
      console.log(`   ⚠️ No students embedded in batch document. Searching BackgroundJobs & related records...`);
      const studentMap = new Map();

      // 1. Search BackgroundJob collection
      const jobs = await BackgroundJob.find({
        $or: [
          { 'payload.batchId': batch._id },
          { 'payload.batchId': String(batch._id) },
          { 'payload.batchId': batch.batchId },
          { 'payload.eventName': batch.eventName },
        ],
      }).lean();

      console.log(`   📦 Found ${jobs.length} matching background job(s) for this batch/event.`);
      for (const job of jobs) {
        const s = job.payload?.student;
        if (s?.name && s?.email) {
          const email = s.email.trim().toLowerCase();
          if (!studentMap.has(email)) {
            studentMap.set(email, {
              name: s.name.trim(),
              email,
              position: s.position?.trim() || 'Participant',
            });
          }
        }
      }

      // 2. Search Certificates collection for any existing or unlinked certificates
      const existingCerts = await Certificate.find({
        $or: [
          { batchId: batch._id },
          { eventName: batch.eventName },
        ],
      }).lean();

      console.log(`   📜 Found ${existingCerts.length} certificate record(s) matching event/batch.`);
      for (const c of existingCerts) {
        if (c.studentName && c.studentEmail) {
          const email = c.studentEmail.trim().toLowerCase();
          if (!studentMap.has(email)) {
            studentMap.set(email, {
              name: c.studentName.trim(),
              email,
              position: c.position?.trim() || 'Participant',
            });
          }
        }
      }

      // 3. Search BoardingPass collection if still empty
      if (studentMap.size === 0) {
        const passes = await BoardingPass.find({ eventName: batch.eventName }).lean();
        console.log(`   🎫 Found ${passes.length} boarding pass(es) for event "${batch.eventName}".`);
        for (const p of passes) {
          if (p.studentName && p.studentEmail) {
            const email = p.studentEmail.trim().toLowerCase();
            if (!studentMap.has(email)) {
              studentMap.set(email, {
                name: p.studentName.trim(),
                email,
                position: 'Participant',
              });
            }
          }
        }
      }

      if (studentMap.size > 0) {
        batch.students = Array.from(studentMap.values());
        batch.studentCount = batch.students.length;
        await batch.save();
        console.log(`   ✨ Successfully discovered and hydrated ${batch.students.length} students from historical jobs/records!`);
      } else {
        console.log(`   ❌ No historical student records found in BackgroundJob, Certificate, or BoardingPass collections for "${batch.eventName}".`);
        continue;
      }
    }

    let batchRestored = 0;
    const frontendUrl = process.env.FRONTEND_URL || 'https://codex.community';

    for (const student of batch.students) {
      const email = student.email.trim().toLowerCase();

      // Check if certificate already exists for this batch and student
      let existingCert = await Certificate.findOne({
        batchId: batch._id,
        studentEmail: email,
      });

      if (!existingCert) {
        // Also check if certificate exists by email & eventName
        existingCert = await Certificate.findOne({
          eventName: batch.eventName,
          studentEmail: email,
        });

        if (existingCert && !existingCert.batchId) {
          // Re-link orphaned certificate back to this batch
          existingCert.batchId = batch._id;
          await existingCert.save();
          console.log(`   🔗 Re-linked existing certificate #${existingCert.certificateId} for ${student.name} (${email})`);
          continue;
        }
      }

      if (!existingCert) {
        // Generate certificate record
        const certificateId = crypto.randomBytes(8).toString('hex');
        const verificationLink = `${frontendUrl}/verify-certificate/${certificateId}`;

        let qrCodeUrl = '';
        try {
          const dataUri = await generateQRCodeWithLogo(verificationLink);
          if (process.env.CLOUDINARY_API_KEY) {
            const qrUpload = await uploadOnCloudinary(dataUri, 'CodeX/certificate');
            if (qrUpload) {
              qrCodeUrl = qrUpload.secure_url || qrUpload.url;
            }
          }
        } catch (qrErr) {
          console.warn(`   ⚠️ QR code generation skipped/failed for ${email}: ${qrErr.message}`);
        }

        await Certificate.create({
          batchId: batch._id,
          studentName: student.name.trim(),
          studentEmail: email,
          eventName: batch.eventName,
          eventDate: batch.eventDate,
          coordinatorName: batch.coordinatorName,
          signatureImage: batch.signatureImage,
          certificateId,
          position: student.position || 'Participant',
          qrCodeImage: qrCodeUrl,
          emailStatus: 'PENDING',
        });

        batchRestored++;
        totalRestored++;
        console.log(`   ✅ Restored certificate #${certificateId} for ${student.name} (${email})`);
      }
    }

    // Refresh batch counts and status
    const actualCount = await Certificate.countDocuments({ batchId: batch._id });
    batch.generatedCount = actualCount;
    if (actualCount >= batch.students.length && batch.students.length > 0) {
      batch.status = 'COMPLETED';
      batch.completedAt = batch.completedAt || new Date();
    }
    await batch.save();

    console.log(`   📊 Batch summary: ${batchRestored} restored. Total active certificates: ${actualCount}/${batch.students.length}`);
  }

  console.log(`\n==================================================`);
  console.log(`🎉 Recovery complete! Restored ${totalRestored} certificates in total.`);
  console.log(`==================================================\n`);
  process.exit(0);
}

runRecovery().catch((err) => {
  console.error('❌ Recovery script failed:', err);
  process.exit(1);
});
