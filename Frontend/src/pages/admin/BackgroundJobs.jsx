import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  RefreshCw,
  Search,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RotateCcw,
  Trash2,
  Loader2,
  Cpu,
  Mail,
  Award,
  Megaphone,
  Ban,
  Sparkles,
  Ticket,
  Eye,
  Database,
  Download,
  ChevronDown,
  FileSpreadsheet,
  FileText,
} from "lucide-react";
import { useSelector } from "react-redux";
import { adminService } from "../../services/adminService";
import { useConfirm } from "../../context/ConfirmContext";
import JobDetailsModal from "./components/JobDetailsModal";

export default function BackgroundJobs() {
  const currentUser = useSelector((state) => state.auth.user);
  const isSuperAdmin = (currentUser?.admin?.role || currentUser?.role) === "SuperAdmin";

  const [items, setItems] = useState([]);
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    suppressed: 0,
    passRate: 100,
    globalDb: {
      totalCertificates: 0,
      totalBoardingPasses: 0,
      totalJobs: 0,
      passedJobs: 0,
      failedJobs: 0,
    },
    byType: {
      certificate: { total: 0, completed: 0, failed: 0, emailsSent: 0, totalGeneratedInDb: 0 },
      boardingPass: { total: 0, completed: 0, failed: 0, emailsSent: 0, totalGeneratedInDb: 0 },
      announcement: { total: 0, completed: 0, failed: 0 },
      email: { total: 0, completed: 0, failed: 0 },
    },
  });
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ totalPages: 1, total: 0 });
  const [message, setMessage] = useState({ type: "", text: "" });
  const [selectedJob, setSelectedJob] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchJobsData = useCallback(
    async (showLoading = true) => {
      if (showLoading) setLoading(true);
      try {
        const [jobsRes, statsRes] = await Promise.all([
          adminService.getBackgroundJobs({
            page,
            limit: 10,
            search,
            status: statusFilter,
            type: typeFilter,
          }),
          adminService.getJobStats(),
        ]);

        if (jobsRes?.success) {
          setItems(jobsRes.data?.items || []);
          setPagination(jobsRes.data?.pagination || { totalPages: 1, total: 0 });
        }

        if (statsRes?.success) {
          setStats(statsRes.data || { total: 0, pending: 0, processing: 0, completed: 0, failed: 0, suppressed: 0 });
        }
      } catch (err) {
        console.error("Failed to load background jobs:", err);
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [page, search, statusFilter, typeFilter]
  );

  useEffect(() => {
    fetchJobsData(true);
  }, [fetchJobsData]);

  // Auto-refresh timer every 3 seconds if active
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchJobsData(false);
    }, 3000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchJobsData]);

  const handleRetry = async (id) => {
    setActionLoading(true);
    setMessage({ type: "", text: "" });
    try {
      const res = await adminService.retryJob(id);
      if (res?.success) {
        setMessage({ type: "success", text: "Job re-queued successfully!" });
        fetchJobsData(false);
      }
    } catch (err) {
      setMessage({
        type: "error",
        text: err.message || err.response?.data?.message || "Failed to retry job.",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const confirm = useConfirm();

  const handleDelete = async (id) => {
    const isConfirmed = await confirm({
      title: "Delete Background Job",
      message: "Are you sure you want to delete this job entry from the system queue?",
    });

    if (!isConfirmed) return;

    setActionLoading(true);
    setMessage({ type: "", text: "" });
    try {
      const res = await adminService.deleteJob(id);
      if (res?.success) {
        setMessage({ type: "success", text: "Job entry deleted." });
        fetchJobsData(false);
      }
    } catch (err) {
      setMessage({
        type: "error",
        text: err.message || err.response?.data?.message || "Failed to delete job.",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleClearCompleted = async () => {
    const isConfirmed = await confirm({
      title: "Clear Completed Logs",
      message: "Are you sure you want to clear all completed background job entries?",
    });

    if (!isConfirmed) return;

    setActionLoading(true);
    setMessage({ type: "", text: "" });
    try {
      const res = await adminService.clearCompletedJobs();
      if (res?.success) {
        setMessage({
          type: "success",
          text: `Cleared ${res.data?.deletedCount || 0} completed jobs.`,
        });
        fetchJobsData(false);
      }
    } catch (err) {
      setMessage({
        type: "error",
        text: err.message || err.response?.data?.message || "Failed to clear completed jobs.",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleExportLogs = async (format = "csv", scope = "all") => {
    if (!isSuperAdmin) {
      setMessage({
        type: "error",
        text: "Access denied: Only Super Admins are authorized to export task queue logs.",
      });
      return;
    }

    setIsExporting(true);
    setShowExportMenu(false);
    setMessage({ type: "", text: "" });

    try {
      const params = {
        format,
        scope,
      };

      if (scope === "filtered") {
        if (statusFilter) params.status = statusFilter;
        if (typeFilter) params.type = typeFilter;
        if (search) params.search = search;
      }

      const res = await adminService.exportJobLogs(params);
      const mimeType = format === "json" ? "application/json;charset=utf-8;" : "text/csv;charset=utf-8;";
      const blob = new Blob([res.data], { type: mimeType });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const scopeLabel = scope === "filtered" ? "Filtered" : "All";
      const ext = format === "json" ? "json" : "csv";
      link.setAttribute("download", `CodeX_Task_Queue_Logs_${scopeLabel}_${timestamp}.${ext}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      setMessage({
        type: "success",
        text: `Task queue logs (${scope === "filtered" ? "filtered" : "all"}) exported successfully as ${format.toUpperCase()}.`,
      });
    } catch (err) {
      console.error("Export error:", err);
      setMessage({
        type: "error",
        text: err?.message || err?.response?.data?.message || "Failed to export task queue logs.",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "PROCESSING":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-mono font-semibold">
            <Loader2 className="w-3 h-3 animate-spin" /> PROCESSING
          </span>
        );
      case "COMPLETED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-mono font-semibold">
            <CheckCircle2 className="w-3 h-3" /> COMPLETED
          </span>
        );
      case "FAILED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 text-xs font-mono font-semibold">
            <AlertTriangle className="w-3 h-3" /> FAILED
          </span>
        );
      case "SUPPRESSED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 text-xs font-mono font-semibold">
            <Ban className="w-3 h-3" /> SUPPRESSED
          </span>
        );
      case "PENDING":
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-mono font-semibold">
            <Clock className="w-3 h-3" /> PENDING
          </span>
        );
    }
  };

  const getTypeBadge = (type) => {
    switch (type) {
      case "CERTIFICATE_BULK":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20 text-xs font-mono font-medium">
            <Award className="w-3 h-3" /> Certificate
          </span>
        );
      case "BOARDING_PASS_BULK":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-xs font-mono font-medium">
            <Ticket className="w-3 h-3" /> Boarding Pass
          </span>
        );
      case "ANNOUNCEMENT_BULK":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-xs font-mono font-medium">
            <Megaphone className="w-3 h-3" /> Announcement
          </span>
        );
      case "EMAIL_SEND":
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-accent/10 text-accent border border-accent/20 text-xs font-mono font-medium">
            <Mail className="w-3 h-3" /> Email Send
          </span>
        );
    }
  };

  const renderPayloadSummary = (job) => {
    const p = job.payload || {};
    if (job.type === "EMAIL_SEND") {
      return (
        <span className="font-mono text-text">
          {p.email ? `To: ${p.email}` : "Bulk Send"}{" "}
          <span className="text-text-muted">({p.subject || "No subject"})</span>
        </span>
      );
    }
    if (job.type === "CERTIFICATE_BULK") {
      return (
        <span className="text-text">
          Event: <strong className="text-accent">{p.eventName}</strong> | Student:{" "}
          <span className="font-semibold">{p.student?.name || p.student?.email}</span>
        </span>
      );
    }
    if (job.type === "BOARDING_PASS_BULK") {
      return (
        <span className="text-text">
          Pass: <strong className="text-accent">{p.eventName}</strong> | Attendee:{" "}
          <span className="font-semibold">{p.student?.name}</span> ({p.student?.email}) {p.student?.qid ? `[QID: ${p.student.qid}]` : ""}
        </span>
      );
    }
    if (job.type === "ANNOUNCEMENT_BULK") {
      return (
        <span className="text-text">
          Broadcast: <strong>{p.subject}</strong> ({p.emailList?.length || 0} recipients)
        </span>
      );
    }
    return <span className="text-text-muted">General background task</span>;
  };

  return (
    <div className="p-3.5 sm:p-6 lg:p-8 xl:p-10 font-sans text-text min-h-full space-y-5 sm:space-y-6 max-w-[1600px] mx-auto w-full">
      {/* Header Banner */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 border border-accent/30 text-accent font-mono text-xs font-bold uppercase tracking-widest mb-2 shadow-sm">
            <Cpu className="w-3.5 h-3.5" />
            <span>TASK QUEUE MONITOR</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-display font-black text-text uppercase tracking-tight">
            BACKGROUND <span className="text-accent">WORKER</span>
          </h1>
          <p className="text-xs sm:text-sm text-text-muted mt-1">
            Monitor email dispatches (12 emails/sec rate limit), certificate generation, and async tasks.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <label className="inline-flex items-center gap-2 text-xs font-mono text-text cursor-pointer bg-card/85 p-2.5 rounded-xl border border-border/80 shadow-sm">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="accent-accent rounded cursor-pointer"
            />
            <span>Auto Refresh (3s)</span>
          </label>

          {stats.completed > 0 && (
            <button
              onClick={handleClearCompleted}
              disabled={actionLoading}
              className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-card border border-border/80 text-xs font-mono text-text-muted hover:text-rose-400 hover:border-rose-500/30 transition-all shadow-sm cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear Completed
            </button>
          )}

          {/* Export Logs Dropdown (Super Admin Only) */}
          {isSuperAdmin && (
            <div className="relative" ref={exportMenuRef}>
              <button
                onClick={() => setShowExportMenu((prev) => !prev)}
                disabled={isExporting}
                className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-card border border-border/80 text-xs font-mono text-text hover:text-accent hover:border-accent/40 transition-all shadow-sm cursor-pointer disabled:opacity-50"
                title="Super Admin • Export Task Queue Logs"
              >
                {isExporting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                <span>{isExporting ? "Exporting..." : "Export Logs"}</span>
                <ChevronDown className="w-3 h-3 text-text-muted" />
              </button>

              {showExportMenu && (
                <div className="absolute right-0 top-full mt-2 w-64 bg-card border border-border rounded-xl shadow-2xl z-50 py-1.5 backdrop-blur-xl animate-fadeIn">
                  <div className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-text-muted border-b border-border/60 flex items-center justify-between">
                    <span>Export Format</span>
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-fuchsia-500/15 text-fuchsia-400 font-bold border border-fuchsia-500/30">
                      SUPER ADMIN
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleExportLogs("csv", "all")}
                    className="w-full px-3.5 py-2 text-left text-xs font-mono hover:bg-card-hover flex items-center justify-between text-text transition-colors cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                      <span>All Logs as CSV</span>
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20">
                      EXCEL
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleExportLogs("json", "all")}
                    className="w-full px-3.5 py-2 text-left text-xs font-mono hover:bg-card-hover flex items-center justify-between text-text transition-colors cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5 text-cyan-400" />
                      <span>All Logs as JSON</span>
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 font-bold border border-cyan-500/20">
                      RAW
                    </span>
                  </button>

                  {(statusFilter || typeFilter || search) && (
                    <>
                      <div className="my-1 border-t border-border/60" />
                      <div className="px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-accent font-bold">
                        Filtered Scope
                      </div>

                      <button
                        type="button"
                        onClick={() => handleExportLogs("csv", "filtered")}
                        className="w-full px-3.5 py-2 text-left text-xs font-mono hover:bg-card-hover flex items-center justify-between text-text transition-colors cursor-pointer"
                      >
                        <span className="flex items-center gap-2">
                          <FileSpreadsheet className="w-3.5 h-3.5 text-accent" />
                          <span>Filtered as CSV</span>
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-bold border border-accent/20">
                          CSV
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleExportLogs("json", "filtered")}
                        className="w-full px-3.5 py-2 text-left text-xs font-mono hover:bg-card-hover flex items-center justify-between text-text transition-colors cursor-pointer"
                      >
                        <span className="flex items-center gap-2">
                          <FileText className="w-3.5 h-3.5 text-accent" />
                          <span>Filtered as JSON</span>
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-bold border border-accent/20">
                          JSON
                        </span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Message Banner */}
      {message.text && (
        <div
          className={`p-4 rounded-xl text-xs font-medium flex items-center justify-between shadow-sm ${
            message.type === "success"
              ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
              : "bg-rose-500/10 border border-rose-500/20 text-rose-400"
          }`}
        >
          <div className="flex items-center gap-2">
            {message.type === "success" ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            <span>{message.text}</span>
          </div>
          <button onClick={() => setMessage({ type: "", text: "" })} className="opacity-70 hover:opacity-100 text-lg leading-none">
            ×
          </button>
        </div>
      )}

      {/* Task Type Highlight Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Certificate Card */}
        <div className="bg-card/85 backdrop-blur-xl p-5 rounded-2xl border border-teal-500/30 shadow-lg relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Award className="w-16 h-16 text-teal-400" />
          </div>
          <div className="flex items-center gap-2 text-teal-400 text-xs font-mono font-bold uppercase tracking-wider mb-2">
            <Award className="w-4 h-4" />
            <span>GLOBAL DB: CERTIFICATES</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-text">
              {stats.globalDb?.totalCertificates ?? stats.byType?.certificate?.totalGeneratedInDb ?? stats.byType?.certificate?.completed ?? 0}
            </span>
            <span className="text-xs text-text-muted font-mono">
              Generated in DB (All Pages)
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] font-mono border-t border-border/40 pt-2">
            <span className="text-text-muted">Task Status:</span>
            <div className="flex items-center gap-1.5">
              <span className="text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                {stats.byType?.certificate?.completed || 0} Pass
              </span>
              <span className="text-rose-400 font-bold bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20">
                {stats.byType?.certificate?.failed || 0} Fail
              </span>
              <span className="text-teal-400 font-bold bg-teal-500/10 px-1.5 py-0.5 rounded border border-teal-500/20">
                {stats.byType?.certificate?.emailsSent || 0} Sent
              </span>
            </div>
          </div>
        </div>

        {/* Boarding Pass Card */}
        <div className="bg-card/85 backdrop-blur-xl p-5 rounded-2xl border border-cyan-500/30 shadow-lg relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Ticket className="w-16 h-16 text-cyan-400" />
          </div>
          <div className="flex items-center gap-2 text-cyan-400 text-xs font-mono font-bold uppercase tracking-wider mb-2">
            <Ticket className="w-4 h-4" />
            <span>GLOBAL DB: BOARDING PASSES</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-text">
              {stats.globalDb?.totalBoardingPasses ?? stats.byType?.boardingPass?.totalGeneratedInDb ?? stats.byType?.boardingPass?.completed ?? 0}
            </span>
            <span className="text-xs text-text-muted font-mono">
              Passes Built in DB (All Pages)
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] font-mono border-t border-border/40 pt-2">
            <span className="text-text-muted">Task Status:</span>
            <div className="flex items-center gap-1.5">
              <span className="text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                {stats.byType?.boardingPass?.completed || 0} Pass
              </span>
              <span className="text-rose-400 font-bold bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20">
                {stats.byType?.boardingPass?.failed || 0} Fail
              </span>
              <span className="text-cyan-400 font-bold bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/20">
                {stats.byType?.boardingPass?.emailsSent || 0} Sent
              </span>
            </div>
          </div>
        </div>

        {/* Global Task Pass/Fail Rate Card */}
        <div className="bg-card/85 backdrop-blur-xl p-5 rounded-2xl border border-emerald-500/30 shadow-lg relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <CheckCircle2 className="w-16 h-16 text-emerald-400" />
          </div>
          <div className="flex items-center gap-2 text-emerald-400 text-xs font-mono font-bold uppercase tracking-wider mb-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>GLOBAL DB: PASS / FAIL RATE</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-text">
              {stats.passRate ?? 100}%
            </span>
            <span className="text-xs text-text-muted font-mono">
              Completion Rate (All Pages)
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] font-mono border-t border-border/40 pt-2">
            <span className="text-text-muted">Database Totals:</span>
            <div className="flex items-center gap-1.5">
              <span className="text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                {stats.completed} Passed
              </span>
              <span className="text-rose-400 font-bold bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                {stats.failed} Failed
              </span>
            </div>
          </div>
        </div>

        {/* Email Dispatches Card */}
        <div className="bg-card/85 backdrop-blur-xl p-5 rounded-2xl border border-accent/30 shadow-lg relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Mail className="w-16 h-16 text-accent" />
          </div>
          <div className="flex items-center gap-2 text-accent text-xs font-mono font-bold uppercase tracking-wider mb-2">
            <Mail className="w-4 h-4" />
            <span>GLOBAL DB: EMAILS (12/S)</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-text">
              {stats.byType?.email?.completed || 0}
            </span>
            <span className="text-xs text-text-muted font-mono">
              / {stats.byType?.email?.total || 0} Dispatched (All Pages)
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] font-mono border-t border-border/40 pt-2">
            <span className="text-text-muted">Dispatch Status:</span>
            <div className="flex items-center gap-1.5">
              <span className="text-accent font-bold bg-accent/10 px-2 py-0.5 rounded border border-accent/20">
                {stats.byType?.email?.completed || 0} Pass
              </span>
              <span className="text-rose-400 font-bold bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                {stats.byType?.email?.failed || 0} Fail
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Global DB Status Summary Cards */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-mono text-text-muted px-1">
          <span className="flex items-center gap-1.5 uppercase font-bold text-accent">
            <Database className="w-3.5 h-3.5" /> GLOBAL DATABASE TASK METRICS (ALL PAGES)
          </span>
          <span className="text-[11px] text-text-muted/70">
            Real-time DB query across all pages
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-card/85 backdrop-blur-xl p-4 rounded-2xl border border-border/80 shadow-sm flex flex-col">
            <span className="text-[10px] font-mono text-text-muted uppercase">TOTAL JOBS (GLOBAL)</span>
            <span className="text-2xl font-black text-text mt-1">{stats.total}</span>
          </div>

          <div className="bg-card/85 backdrop-blur-xl p-4 rounded-2xl border border-border/80 shadow-sm flex flex-col">
            <span className="text-[10px] font-mono text-amber-400/90 uppercase flex items-center gap-1">
              <Clock className="w-3 h-3" /> PENDING (GLOBAL)
            </span>
            <span className="text-2xl font-black text-amber-400 mt-1">{stats.pending}</span>
          </div>

          <div className="bg-card/85 backdrop-blur-xl p-4 rounded-2xl border border-border/80 shadow-sm flex flex-col">
            <span className="text-[10px] font-mono text-blue-400/90 uppercase flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> RUNNING (GLOBAL)
            </span>
            <span className="text-2xl font-black text-blue-400 mt-1">{stats.processing}</span>
          </div>

          <div className="bg-card/85 backdrop-blur-xl p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 shadow-sm flex flex-col">
            <span className="text-[10px] font-mono text-emerald-400 uppercase flex items-center gap-1 font-bold">
              <CheckCircle2 className="w-3 h-3" /> PASS / DONE (GLOBAL)
            </span>
            <span className="text-2xl font-black text-emerald-400 mt-1">{stats.completed}</span>
          </div>

          <div className="bg-card/85 backdrop-blur-xl p-4 rounded-2xl border border-rose-500/30 bg-rose-500/5 shadow-sm flex flex-col">
            <span className="text-[10px] font-mono text-rose-400 uppercase flex items-center gap-1 font-bold">
              <AlertTriangle className="w-3 h-3" /> FAIL / ERROR (GLOBAL)
            </span>
            <span className="text-2xl font-black text-rose-400 mt-1">{stats.failed}</span>
          </div>

          <div className="bg-card/85 backdrop-blur-xl p-4 rounded-2xl border border-border/80 shadow-sm flex flex-col">
            <span className="text-[10px] font-mono text-purple-400/90 uppercase flex items-center gap-1">
              <Ban className="w-3 h-3" /> BLOCKED (GLOBAL)
            </span>
            <span className="text-2xl font-black text-purple-400 mt-1">{stats.suppressed}</span>
          </div>
        </div>
      </div>

      {/* Filter Controls */}
      <div className="bg-card/85 backdrop-blur-xl p-4 rounded-2xl border border-border/80 shadow-sm flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search email, job type..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full pl-10 pr-4 py-2.5 text-xs bg-card border border-border rounded-xl focus:outline-none focus:border-accent text-text"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="px-3.5 py-2.5 text-xs bg-card border border-border rounded-xl focus:outline-none focus:border-accent text-text"
          >
            <option value="">All Statuses</option>
            <option value="PENDING">PENDING</option>
            <option value="PROCESSING">PROCESSING</option>
            <option value="COMPLETED">COMPLETED (PASS)</option>
            <option value="FAILED">FAILED (FAIL)</option>
            <option value="SUPPRESSED">SUPPRESSED</option>
          </select>

          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
            className="px-3.5 py-2.5 text-xs bg-card border border-border rounded-xl focus:outline-none focus:border-accent text-text"
          >
            <option value="">All Job Types</option>
            <option value="EMAIL_SEND">Email Send</option>
            <option value="CERTIFICATE_BULK">Certificate Bulk</option>
            <option value="BOARDING_PASS_BULK">Boarding Pass Bulk</option>
            <option value="ANNOUNCEMENT_BULK">Announcement Bulk</option>
          </select>

          {isSuperAdmin && (
            <button
              onClick={() => handleExportLogs("csv", statusFilter || typeFilter || search ? "filtered" : "all")}
              disabled={isExporting}
              title={statusFilter || typeFilter || search ? "Super Admin: Export Filtered Logs as CSV" : "Super Admin: Export All Logs as CSV"}
              className="p-2.5 rounded-xl bg-card border border-border text-text-muted hover:text-accent hover:border-accent/40 hover:bg-card-hover transition-colors shadow-sm cursor-pointer disabled:opacity-50"
            >
              {isExporting ? (
                <Loader2 className="w-4 h-4 animate-spin text-accent" />
              ) : (
                <Download className="w-4 h-4" />
              )}
            </button>
          )}

          <button
            onClick={() => fetchJobsData(true)}
            title="Refresh Tasks"
            className="p-2.5 rounded-xl bg-card border border-border text-text-muted hover:text-text hover:bg-card-hover transition-colors shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-accent" : ""}`} />
          </button>
        </div>
      </div>

      {/* Queue Scope & Global Sync Indicator */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 px-4 py-3 rounded-2xl bg-card/85 backdrop-blur-xl border border-border/80 text-xs font-mono shadow-sm">
        <div className="flex items-center gap-2 text-text-muted">
          <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
          <span>
            Queue Scope: Showing <strong className="text-text">Page {pagination.page} of {pagination.totalPages || 1}</strong> ({items.length} tasks on current page | {pagination.total} matching query)
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-emerald-400 font-bold bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20 text-[11px]">
            ✓ {stats.completed} Passed (Global DB)
          </span>
          <span className="text-rose-400 font-bold bg-rose-500/10 px-2.5 py-1 rounded-full border border-rose-500/20 text-[11px]">
            ✕ {stats.failed} Failed (Global DB)
          </span>
          <span className="text-text-muted font-bold bg-card px-2.5 py-1 rounded-full border border-border text-[11px]">
            {stats.total} Total in DB
          </span>
        </div>
      </div>

      {/* Jobs Container: Desktop Table & Mobile Cards */}
      <div className="bg-card/85 backdrop-blur-xl rounded-2xl border border-border/80 shadow-lg overflow-hidden">
        {loading && items.length === 0 ? (
          <div className="p-12 text-center text-text-muted flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-accent" />
            <span className="text-xs font-mono">Loading task queue...</span>
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-text-muted flex flex-col items-center gap-3">
            <Sparkles className="w-10 h-10 text-emerald-400/80" />
            <span className="text-sm font-semibold text-text">No background tasks found</span>
            <span className="text-xs">Queue is clear and ready for background tasks.</span>
          </div>
        ) : (
          <>
            {/* Desktop Table View (Hidden on Mobile) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border/60 bg-card-hover/50 text-[11px] font-mono text-text-muted uppercase">
                    <th className="p-4 pl-6">Job Type</th>
                    <th className="p-4">Payload Details</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Attempts</th>
                    <th className="p-4">Scheduled / Processed</th>
                    <th className="p-4 pr-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40 text-xs">
                  {items.map((job) => (
                    <tr key={job._id} className="hover:bg-card-hover/30 transition-colors">
                      <td className="p-4 pl-6 whitespace-nowrap">{getTypeBadge(job.type)}</td>
                      <td className="p-4 max-w-sm truncate">
                        {renderPayloadSummary(job)}
                        {job.lastError && (
                          <div className="text-[11px] text-rose-400 mt-1 font-mono truncate" title={job.lastError}>
                            Error: {job.lastError}
                          </div>
                        )}
                      </td>
                      <td className="p-4 whitespace-nowrap">{getStatusBadge(job.status)}</td>
                      <td className="p-4 font-mono text-text-muted whitespace-nowrap">
                        {job.attempts} / {job.maxAttempts}
                      </td>
                      <td className="p-4 text-text-muted whitespace-nowrap text-[11px]">
                        <div>Sched: {new Date(job.scheduledAt).toLocaleTimeString("en-IN")}</div>
                        {job.processedAt && (
                          <div className="text-text-muted/70">Done: {new Date(job.processedAt).toLocaleTimeString("en-IN")}</div>
                        )}
                      </td>
                      <td className="p-4 pr-6 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setSelectedJob(job)}
                            className="p-1.5 rounded-lg border border-border bg-card text-text-muted hover:text-accent hover:border-accent/30 transition-all"
                            title="Inspect Task Details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          {(job.status === "FAILED" || job.status === "SUPPRESSED") && (
                            <button
                              onClick={() => handleRetry(job._id)}
                              disabled={actionLoading}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-accent/10 text-accent border border-accent/20 text-xs font-mono font-medium hover:bg-accent/20 transition-all"
                            >
                              <RotateCcw className="w-3 h-3" /> Retry
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(job._id)}
                            disabled={actionLoading}
                            className="p-1.5 rounded-lg border border-border bg-card text-text-muted hover:text-rose-400 hover:border-rose-500/30 transition-all"
                            title="Delete Job Entry"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View (Visible only on mobile screens) */}
            <div className="block md:hidden divide-y divide-border/60">
              {items.map((job) => (
                <div key={job._id} className="p-4 space-y-3 bg-card-hover/20">
                  <div className="flex items-center justify-between gap-2">
                    {getTypeBadge(job.type)}
                    {getStatusBadge(job.status)}
                  </div>

                  <div className="text-xs space-y-1">
                    {renderPayloadSummary(job)}
                    {job.lastError && (
                      <div className="text-[11px] text-rose-400 font-mono mt-1 bg-rose-500/10 p-2 rounded-lg border border-rose-500/20">
                        Error: {job.lastError}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-[11px] font-mono text-text-muted border-t border-border/40 pt-2.5">
                    <div>
                      Attempts: <span className="text-text">{job.attempts}/{job.maxAttempts}</span>
                    </div>
                    <div>
                      {new Date(job.scheduledAt).toLocaleTimeString("en-IN")}
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      onClick={() => setSelectedJob(job)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-border bg-card text-text-muted hover:text-accent transition-all text-xs font-mono"
                    >
                      <Eye className="w-3.5 h-3.5" /> Inspect
                    </button>
                    {(job.status === "FAILED" || job.status === "SUPPRESSED") && (
                      <button
                        onClick={() => handleRetry(job._id)}
                        disabled={actionLoading}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accent/10 text-accent border border-accent/20 text-xs font-mono font-medium hover:bg-accent/20 transition-all"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> Retry Job
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(job._id)}
                      disabled={actionLoading}
                      className="p-1.5 rounded-xl border border-border bg-card text-text-muted hover:text-rose-400 transition-all"
                      title="Delete Job"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Pagination Footer */}
        {pagination.totalPages > 1 && (
          <div className="p-4 border-t border-border/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-text-muted">
            <span>
              Page {pagination.page} of {pagination.totalPages} ({pagination.total} total tasks)
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3.5 py-1.5 rounded-xl border border-border bg-card text-text disabled:opacity-50"
              >
                Previous
              </button>
              <button
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3.5 py-1.5 rounded-xl border border-border bg-card text-text disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Task Inspection Modal Popup */}
      {selectedJob && (
        <JobDetailsModal
          job={selectedJob}
          onClose={() => setSelectedJob(null)}
          onRetry={handleRetry}
        />
      )}
    </div>
  );
}
