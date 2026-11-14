import { BackgroundJob } from '../models/backgroundJob.model.js';
import { Certificate } from '../models/certificate.model.js';
import { BoardingPass } from '../models/boardingPass.model.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Get paginated list of background jobs with filtering & search
 */
const getBackgroundJobs = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const rawStatus = typeof req.query.status === 'string' ? req.query.status.trim() : '';
  const rawType = typeof req.query.type === 'string' ? req.query.type.trim() : '';
  const rawSearch = typeof req.query.search === 'string' ? req.query.search.trim() : '';

  const query = {};

  const allowedStatuses = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'SUPPRESSED'];
  if (rawStatus && allowedStatuses.includes(rawStatus)) {
    query.status = rawStatus;
  }

  const allowedTypes = ['EMAIL_SEND', 'CERTIFICATE_BULK', 'BOARDING_PASS_BULK', 'ANNOUNCEMENT_BULK'];
  if (rawType && allowedTypes.includes(rawType)) {
    query.type = rawType;
  }

  if (rawSearch) {
    const safeSearch = escapeRegExp(rawSearch).slice(0, 100);
    query.$or = [
      { type: { $regex: safeSearch, $options: 'i' } },
      { 'payload.email': { $regex: safeSearch, $options: 'i' } },
      { 'payload.student.email': { $regex: safeSearch, $options: 'i' } },
      { 'payload.eventName': { $regex: safeSearch, $options: 'i' } },
    ];
  }

  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    BackgroundJob.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    BackgroundJob.countDocuments(query),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        items,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      'Background jobs fetched successfully'
    )
  );
});

/**
 * Get background job metrics summary across the entire database (all pages)
 */
const getJobStats = asyncHandler(async (req, res) => {
  const [
    total,
    pending,
    processing,
    completed,
    failed,
    suppressed,
    totalCertificatesInDb,
    totalBoardingPassesInDb,
    certificateTotal,
    certificateDone,
    certificateFailed,
    certificateEmailSent,
    boardingPassTotal,
    boardingPassDone,
    boardingPassFailed,
    boardingPassEmailSent,
    announcementTotal,
    announcementDone,
    announcementFailed,
    emailTotal,
    emailDone,
    emailFailed,
  ] = await Promise.all([
    // Global job queue counts across entire DB
    BackgroundJob.countDocuments(),
    BackgroundJob.countDocuments({ status: 'PENDING' }),
    BackgroundJob.countDocuments({ status: 'PROCESSING' }),
    BackgroundJob.countDocuments({ status: 'COMPLETED' }),
    BackgroundJob.countDocuments({ status: 'FAILED' }),
    BackgroundJob.countDocuments({ status: 'SUPPRESSED' }),
    // True global database entities generated (all pages)
    Certificate.countDocuments(),
    BoardingPass.countDocuments(),
    // Certificate jobs
    BackgroundJob.countDocuments({ type: 'CERTIFICATE_BULK' }),
    BackgroundJob.countDocuments({ type: 'CERTIFICATE_BULK', status: 'COMPLETED' }),
    BackgroundJob.countDocuments({ type: 'CERTIFICATE_BULK', status: 'FAILED' }),
    BackgroundJob.countDocuments({ type: 'EMAIL_SEND', 'payload.subject': { $regex: /Certificate/i }, status: 'COMPLETED' }),
    // Boarding Pass jobs
    BackgroundJob.countDocuments({ type: 'BOARDING_PASS_BULK' }),
    BackgroundJob.countDocuments({ type: 'BOARDING_PASS_BULK', status: 'COMPLETED' }),
    BackgroundJob.countDocuments({ type: 'BOARDING_PASS_BULK', status: 'FAILED' }),
    BackgroundJob.countDocuments({ type: 'EMAIL_SEND', 'payload.subject': { $regex: /Boarding Pass/i }, status: 'COMPLETED' }),
    // Announcement jobs
    BackgroundJob.countDocuments({ type: 'ANNOUNCEMENT_BULK' }),
    BackgroundJob.countDocuments({ type: 'ANNOUNCEMENT_BULK', status: 'COMPLETED' }),
    BackgroundJob.countDocuments({ type: 'ANNOUNCEMENT_BULK', status: 'FAILED' }),
    // Email jobs
    BackgroundJob.countDocuments({ type: 'EMAIL_SEND' }),
    BackgroundJob.countDocuments({ type: 'EMAIL_SEND', status: 'COMPLETED' }),
    BackgroundJob.countDocuments({ type: 'EMAIL_SEND', status: 'FAILED' }),
  ]);

  const finishedJobs = completed + failed;
  const passRate = finishedJobs > 0 ? Number(((completed / finishedJobs) * 100).toFixed(1)) : 100;

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        total,
        pending,
        processing,
        completed, // Passed tasks across entire database
        failed,    // Failed tasks across entire database
        suppressed,
        passRate,
        globalDb: {
          totalCertificates: totalCertificatesInDb,
          totalBoardingPasses: totalBoardingPassesInDb,
          totalJobs: total,
          passedJobs: completed,
          failedJobs: failed,
        },
        byType: {
          certificate: {
            total: certificateTotal,
            completed: certificateDone,
            failed: certificateFailed,
            emailsSent: certificateEmailSent,
            totalGeneratedInDb: totalCertificatesInDb,
          },
          boardingPass: {
            total: boardingPassTotal,
            completed: boardingPassDone,
            failed: boardingPassFailed,
            emailsSent: boardingPassEmailSent,
            totalGeneratedInDb: totalBoardingPassesInDb,
          },
          announcement: {
            total: announcementTotal,
            completed: announcementDone,
            failed: announcementFailed,
          },
          email: {
            total: emailTotal,
            completed: emailDone,
            failed: emailFailed,
          },
        },
      },
      'Job statistics fetched successfully'
    )
  );
});

/**
 * Manually retry a failed or suppressed job
 */
const retryJob = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const job = await BackgroundJob.findById(id);
  if (!job) {
    throw new ApiError(404, 'Background job not found');
  }

  job.status = 'PENDING';
  job.attempts = 0;
  job.lastError = '';
  job.scheduledAt = new Date();
  job.processedAt = null;

  await job.save();

  return res.status(200).json(new ApiResponse(200, job, 'Job re-queued for execution successfully'));
});

/**
 * Delete a specific job
 */
const deleteJob = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const job = await BackgroundJob.findByIdAndDelete(id);
  if (!job) {
    throw new ApiError(404, 'Background job not found');
  }

  return res.status(200).json(new ApiResponse(200, job, 'Job deleted successfully'));
});

/**
 * Bulk clear completed background jobs
 */
const clearCompletedJobs = asyncHandler(async (req, res) => {
  const result = await BackgroundJob.deleteMany({ status: 'COMPLETED' });

  return res
    .status(200)
    .json(new ApiResponse(200, { deletedCount: result.deletedCount }, 'Cleared completed background jobs'));
});

/**
 * Export background job logs as CSV or JSON
 * @route GET /api/v1/admin/jobs/export
 * @access Private (Super Admin Only)
 */
const exportJobLogs = asyncHandler(async (req, res) => {
  if (req.admin?.role !== 'SuperAdmin') {
    throw new ApiError(403, 'Forbidden: Only Super Admins are authorized to export task queue logs');
  }

  const format = (req.query.format || 'csv').toLowerCase();
  const rawStatus = typeof req.query.status === 'string' ? req.query.status.trim() : '';
  const rawType = typeof req.query.type === 'string' ? req.query.type.trim() : '';
  const rawSearch = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const scope = (req.query.scope || 'all').toLowerCase();

  const query = {};

  if (scope === 'filtered') {
    const allowedStatuses = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'SUPPRESSED'];
    if (rawStatus && allowedStatuses.includes(rawStatus)) {
      query.status = rawStatus;
    }

    const allowedTypes = ['EMAIL_SEND', 'CERTIFICATE_BULK', 'BOARDING_PASS_BULK', 'ANNOUNCEMENT_BULK'];
    if (rawType && allowedTypes.includes(rawType)) {
      query.type = rawType;
    }

    if (rawSearch) {
      const safeSearch = escapeRegExp(rawSearch).slice(0, 100);
      query.$or = [
        { type: { $regex: safeSearch, $options: 'i' } },
        { 'payload.email': { $regex: safeSearch, $options: 'i' } },
        { 'payload.student.email': { $regex: safeSearch, $options: 'i' } },
        { 'payload.eventName': { $regex: safeSearch, $options: 'i' } },
        { 'payload.subject': { $regex: safeSearch, $options: 'i' } },
      ];
    }
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  if (format === 'json') {
    const filename = `CodeX_Task_Queue_Logs_${timestamp}.json`;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');

    // High-performance streaming cursor with batchSize: 500
    // Memory footprint stays constant O(1) regardless of whether there are 100 or 100,000 tasks
    const cursor = BackgroundJob.find(query)
      .sort({ createdAt: -1 })
      .lean()
      .cursor({ batchSize: 500 });

    req.on('close', () => {
      cursor.close().catch(() => {});
    });

    res.write('[\n');
    let isFirst = true;

    for await (const job of cursor) {
      if (!isFirst) {
        res.write(',\n');
      }
      res.write(JSON.stringify(job, null, 2));
      isFirst = false;
    }

    res.write('\n]');
    return res.end();
  }

  // Prepend UTF-8 BOM (\uFEFF) for Microsoft Excel compatibility
  const headers = [
    'Job ID',
    'Task Type',
    'Status',
    'Recipient / Email',
    'Student Name',
    'Event / Subject',
    'Attempts',
    'Max Attempts',
    'Duration (sec)',
    'Created At',
    'Scheduled At',
    'Processed At',
    'Last Error / Failure Details',
  ];

  const filename = `CodeX_Task_Queue_Logs_${timestamp}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');

  // Stream CSV header with UTF-8 BOM
  res.write('\uFEFF' + headers.map((h) => `"${h}"`).join(',') + '\r\n');

  // Memory optimization: Project only the required metadata fields to avoid loading large HTML bodies into RAM
  const cursor = BackgroundJob.find(query)
    .select('type status attempts maxAttempts lastError createdAt scheduledAt processedAt payload.email payload.student payload.eventName payload.subject payload.emailList')
    .sort({ createdAt: -1 })
    .lean()
    .cursor({ batchSize: 500 });

  req.on('close', () => {
    cursor.close().catch(() => {});
  });

  for await (const job of cursor) {
    const p = job.payload || {};
    const recipientEmail = p.email || p.student?.email || (p.emailList?.length ? `${p.emailList.length} recipients` : '');
    const studentName = p.student?.name || '';
    const eventOrSubject = p.eventName || p.subject || '';

    let durationSec = '';
    if (job.processedAt && job.createdAt) {
      const ms = new Date(job.processedAt).getTime() - new Date(job.createdAt).getTime();
      durationSec = (ms / 1000).toFixed(2);
    }

    const row = [
      `"${String(job._id || '').replace(/"/g, '""')}"`,
      `"${String(job.type || '').replace(/"/g, '""')}"`,
      `"${String(job.status || '').replace(/"/g, '""')}"`,
      `"${String(recipientEmail || '').replace(/"/g, '""')}"`,
      `"${String(studentName || '').replace(/"/g, '""')}"`,
      `"${String(eventOrSubject || '').replace(/"/g, '""')}"`,
      `"${job.attempts ?? 0}"`,
      `"${job.maxAttempts ?? 3}"`,
      `"${durationSec}"`,
      `"${job.createdAt ? new Date(job.createdAt).toISOString() : ''}"`,
      `"${job.scheduledAt ? new Date(job.scheduledAt).toISOString() : ''}"`,
      `"${job.processedAt ? new Date(job.processedAt).toISOString() : ''}"`,
      `"${String(job.lastError || '').replace(/"/g, '""')}"`,
    ];

    res.write(row.join(',') + '\r\n');
  }

  return res.end();
});

export { getBackgroundJobs, getJobStats, retryJob, deleteJob, clearCompletedJobs, exportJobLogs };
