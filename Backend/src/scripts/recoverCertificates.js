import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import crypto from 'crypto';
import connectDB from '../config/db.js';
import { CertificateBatch } from '../models/certificateBatch.model.js';
import { Certificate } from '../models/certificate.model.js';
import { generateQRCodeWithLogo } from '../utils/qrGenerator.js';
import { uploadOnCloudinary } from '../utils/cloudinary.js';

async function runRecovery() {
  console.log('🚀 Starting Certificate Recovery Process...');
  await connectDB();

  const targetBatchId = process.argv[2]; // Optional CLI argument: node recoverCertificates.js [batchId]
  const query = targetBatchId ? { $or: [{ batchId: targetBatchId }, { _id: mongoose.isValidObjectId(targetBatchId) ? targetBatchId : null }] } : {};

  const batches = await CertificateBatch.find(query).sort({ createdAt: -1 });
  console.log(`📋 Found ${batches.length} batch(es) in database.`);

  let totalRestored = 0;

  for (const batch of batches) {
    console.log(`\n--------------------------------------------------`);
    console.log(`🔎 Batch: #${batch.batchId} | Event: "${batch.eventName}" | Date: ${batch.eventDate?.toISOString()?.slice(0, 10)}`);
    console.log(`   Status: ${batch.status} | Students in roster: ${batch.students?.length || 0}`);

    if (!batch.students || batch.students.length === 0) {
      console.log(`   ⚠️ No students found in this batch record. Skipping.`);
      continue;
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
    if (actualCount >= batch.students.length) {
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
