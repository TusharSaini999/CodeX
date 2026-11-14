import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Search,
  Award,
  ExternalLink,
  Loader2,
  Mail,
  User,
  ShieldCheck,
  Copy,
  Check,
  Sparkles,
  Layers,
  FileCheck,
  Trash2,
  Send,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Download,
} from "lucide-react";
import { useSelector } from "react-redux";
import { certificateService } from "../../../services/certificateService";
import { useConfirm } from "../../../context/ConfirmContext";

export default function IssuedCertificatesModal({ onClose, isModal = false, isSuperAdmin: propIsSuperAdmin }) {
  const confirm = useConfirm();
  const currentUser = useSelector((state) => state.auth.user);
  const isSuperAdmin = propIsSuperAdmin ?? ((currentUser?.admin?.role || currentUser?.role) === "SuperAdmin");

  const [certificates, setCertificates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ totalPages: 1, total: 0 });
  const [copiedId, setCopiedId] = useState(null);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [feedback, setFeedback] = useState({ type: "", text: "" });

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(handler);
  }, [search]);

  const fetchCertificates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await certificateService.getAllCertificates({
        page,
        limit: 12,
        search: debouncedSearch,
      });
      const data = res.data?.data || res.data;
      setCertificates(data.certificates || []);
      setPagination(data.pagination || { totalPages: 1, total: 0 });
    } catch (err) {
      console.error("Failed to fetch issued certificates:", err);
      setFeedback({
        type: "error",
        text: err.response?.data?.message || "Failed to fetch issued certificates.",
      });
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch]);

  useEffect(() => {
    fetchCertificates();
  }, [fetchCertificates]);

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleResendEmail = async (cert) => {
    setActionLoadingId(cert._id);
    try {
      const res = await certificateService.resendCertificateEmail(cert._id);
      setFeedback({
        type: "success",
        text: res.message || `Certificate email queued for delivery to ${cert.studentEmail}.`,
      });
      setCertificates((prev) =>
        prev.map((c) =>
          c._id === cert._id ? { ...c, emailStatus: "SENT" } : c
        )
      );
    } catch (err) {
      setFeedback({
        type: "error",
        text: err.response?.data?.message || "Failed to resend certificate email.",
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDeleteCertificate = async (cert) => {
    const isConfirmed = await confirm({
      title: "Move Certificate to 7-Day Trash",
      message: `Move certificate #${cert.certificateId} for ${cert.studentName} to 7-day recovery trash? Verification will be revoked immediately, and Super Admins can restore it from the 7-day Trash Vault before MongoDB permanently auto-purges it.`,
    });

    if (!isConfirmed) return;

    setActionLoadingId(cert._id);
    try {
      const res = await certificateService.deleteCertificate(cert._id);
      setFeedback({
        type: "success",
        text: res.message || `Certificate #${cert.certificateId} deleted successfully.`,
      });
      setCertificates((prev) => prev.filter((c) => c._id !== cert._id));
      setPagination((prev) => ({
        ...prev,
        total: Math.max(0, prev.total - 1),
      }));
    } catch (err) {
      setFeedback({
        type: "error",
        text: err.response?.data?.message || "Failed to delete certificate.",
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  const [isExporting, setIsExporting] = useState(false);

  const handleExportAll = async () => {
    setIsExporting(true);
    try {
      const res = await certificateService.exportAllCertificates({ search: debouncedSearch });
      const rawData =
        res instanceof Blob
          ? res
          : res?.data instanceof Blob
          ? res.data
          : res?.data !== undefined
          ? res.data
          : res;
      const blob =
        rawData instanceof Blob
          ? rawData
          : new Blob([String(rawData || "")], { type: "text/csv;charset=utf-8;" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const dateStr = new Date().toISOString().split("T")[0];
      link.setAttribute("download", `CodeX_Certificates_${dateStr}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setFeedback({
        type: "success",
        text: `Exported certificates CSV successfully!`,
      });
    } catch (err) {
      setFeedback({
        type: "error",
        text: err.response?.data?.message || "Failed to export certificates CSV.",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const renderEmailStatus = (status) => {
    switch (status) {
      case "SENT":
      case "DELIVERED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <Check className="w-3 h-3" /> Delivered
          </span>
        );
      case "FAILED":
      case "BOUNCED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
            <AlertTriangle className="w-3 h-3" /> Delivery Failed
          </span>
        );
      case "PENDING":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <Loader2 className="w-3 h-3 animate-spin" /> Pending Dispatch
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <Check className="w-3 h-3" /> Delivered
          </span>
        );
    }
  };

  const containerContent = (
    <div className="w-full flex flex-col space-y-6 animate-fadeIn">
      {/* Feedback banner */}
      {feedback.text && (
        <div
          className={`flex items-center justify-between gap-3 p-4 rounded-xl text-xs font-mono font-bold border transition-all ${
            feedback.type === "success"
              ? "bg-accent/15 text-accent border-accent/40"
              : "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/40"
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button
            onClick={() => setFeedback({ type: "", text: "" })}
            className="text-text-muted hover:text-text cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Control & Stat Summary Bar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 shrink-0">
        {/* Search Input & CSV Export Button */}
        <div className="lg:col-span-6 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-3 w-4 h-4 text-text-muted" />
            <input
              type="text"
              placeholder="Search by student name, email, event, or certificate ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-card border border-border text-text rounded-xl py-2.5 pl-10 pr-4 text-xs font-medium focus:outline-none focus:border-teal-500 transition-all shadow-sm"
            />
          </div>

          <button
            onClick={handleExportAll}
            disabled={isExporting || pagination.total === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-card border border-border text-text hover:text-accent hover:bg-card-hover font-mono text-xs font-bold transition-all disabled:opacity-50 cursor-pointer shadow-sm shrink-0"
            title="Download CSV export of certificates"
          >
            {isExporting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            <span>Export CSV</span>
          </button>
        </div>

        {/* Quick Stat Cards */}
        <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
          <div className="p-3 rounded-xl bg-card border border-border/80 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-teal-500/10 text-teal-400">
              <FileCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] font-mono text-text-muted uppercase">Total Certificates</div>
              <div className="font-mono font-bold text-text text-sm">{pagination.total}</div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-card border border-border/80 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent/10 text-accent">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] font-mono text-text-muted uppercase">Current Page</div>
              <div className="font-mono font-bold text-text text-sm">{pagination.page} / {pagination.totalPages || 1}</div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-card border border-border/80 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] font-mono text-text-muted uppercase">Verification</div>
              <div className="font-mono font-bold text-emerald-400 text-xs">Cryptographic Audit</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area (Scrollable Data Grid) */}
      <div className="bg-card/85 backdrop-blur-xl rounded-2xl border border-border/80 shadow-xl overflow-hidden flex flex-col min-h-[500px]">
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {loading && certificates.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-text-muted gap-3 py-16">
              <Loader2 className="w-10 h-10 animate-spin text-teal-400" />
              <span className="text-xs font-mono">Querying certificate database...</span>
            </div>
          ) : certificates.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-text-muted gap-3 py-16">
              <Sparkles className="w-12 h-12 text-teal-400/60" />
              <span className="text-sm font-semibold text-text">No certificates found</span>
              <span className="text-xs">No records match your search criteria.</span>
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border/60 bg-card-hover/50 text-[11px] font-mono text-text-muted uppercase">
                      <th className="p-4 pl-6">Student Information</th>
                      <th className="p-4">Event Details & Role</th>
                      <th className="p-4">Certificate ID</th>
                      <th className="p-4">Delivery Status</th>
                      <th className="p-4">Issued Timestamp</th>
                      <th className="p-4 pr-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40 text-xs font-sans">
                    {certificates.map((cert) => {
                      const isActionLoading = actionLoadingId === cert._id;

                      return (
                        <tr key={cert._id} className="hover:bg-card-hover/40 transition-colors">
                          {/* Student Info */}
                          <td className="p-4 pl-6">
                            <div className="font-bold text-text flex items-center gap-2">
                              <User className="w-4 h-4 text-teal-400 shrink-0" />
                              <span>{cert.studentName}</span>
                            </div>
                            <div className="text-[11px] text-text-muted font-mono flex items-center gap-1.5 mt-1">
                              <Mail className="w-3.5 h-3.5 shrink-0" />
                              <span>{cert.studentEmail}</span>
                            </div>
                          </td>

                          {/* Event & Position */}
                          <td className="p-4">
                            <div className="font-semibold text-text text-sm">{cert.eventName}</div>
                            <div className="inline-flex items-center gap-1 mt-1 px-2.5 py-0.5 rounded-full bg-teal-500/10 text-teal-400 border border-teal-500/20 text-[11px] font-mono font-medium">
                              {cert.position || "Participant"}
                            </div>
                          </td>

                          {/* Certificate ID */}
                          <td className="p-4 font-mono">
                            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-card border border-border/80 text-accent font-bold text-xs">
                              <span>{cert.certificateId}</span>
                              <button
                                onClick={() => copyToClipboard(cert.certificateId, cert._id)}
                                className="text-text-muted hover:text-text transition-colors cursor-pointer"
                                title="Copy Certificate ID"
                              >
                                {copiedId === cert._id ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </td>

                          {/* Delivery Status */}
                          <td className="p-4 font-mono">
                            {renderEmailStatus(cert.emailStatus)}
                          </td>

                          {/* Timestamp */}
                          <td className="p-4 font-mono text-text-muted text-[11px]">
                            <div>{new Date(cert.createdAt).toLocaleDateString("en-IN")}</div>
                            <div className="text-text-muted/60">{new Date(cert.createdAt).toLocaleTimeString("en-IN")}</div>
                          </td>

                          {/* Actions */}
                          <td className="p-4 pr-6 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {/* Verify Portal Link */}
                              <a
                                href={`/verify-certificate/${cert.certificateId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20 hover:bg-teal-500/20 transition-all font-mono font-bold text-xs shadow-sm"
                                title="Open Public Verification Link"
                              >
                                <ShieldCheck className="w-3.5 h-3.5" />
                                <span>Verify</span>
                                <ExternalLink className="w-3 h-3 ml-0.5" />
                              </a>

                              {/* Resend Email Button */}
                              <button
                                onClick={() => handleResendEmail(cert)}
                                disabled={isActionLoading}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-card border border-border text-text-muted hover:text-text hover:bg-card-hover text-xs font-mono transition-all disabled:opacity-50 cursor-pointer"
                                title="Resend Certificate Email to Student"
                              >
                                {isActionLoading ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Mail className="w-3.5 h-3.5" />
                                )}
                                <span>Resend</span>
                              </button>

                              {/* Delete Certificate Button (Super Admin Only) */}
                              {isSuperAdmin && (
                                <button
                                  onClick={() => handleDeleteCertificate(cert)}
                                  disabled={isActionLoading}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30 hover:bg-rose-500/25 text-xs font-mono font-bold transition-all disabled:opacity-50 cursor-pointer"
                                  title="Permanently Delete Certificate and Revoke Verification"
                                >
                                  {isActionLoading ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Trash2 className="w-3.5 h-3.5" />
                                  )}
                                  <span>Delete</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="block md:hidden space-y-4">
                {certificates.map((cert) => {
                  const isActionLoading = actionLoadingId === cert._id;

                  return (
                    <div key={cert._id} className="p-4 rounded-xl bg-card-hover/40 border border-border/60 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="font-bold text-text text-sm flex items-center gap-2">
                          <User className="w-4 h-4 text-teal-400" />
                          <span>{cert.studentName}</span>
                        </div>
                        <span className="px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-400 text-[10px] font-mono">
                          {cert.position || "Participant"}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs text-text-muted font-mono">
                        <div className="break-all flex items-center gap-1">
                          <Mail className="w-3.5 h-3.5 shrink-0" />
                          <span>{cert.studentEmail}</span>
                        </div>
                        <div>{renderEmailStatus(cert.emailStatus)}</div>
                      </div>

                      <div className="p-2.5 rounded-lg bg-card border border-border/80 space-y-1">
                        <div className="text-[10px] font-mono text-text-muted uppercase">Event & ID</div>
                        <div className="font-semibold text-text">{cert.eventName}</div>
                        <div className="text-xs font-mono font-bold text-accent">{cert.certificateId}</div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/40 text-[11px] font-mono">
                        <span className="text-text-muted">{new Date(cert.createdAt).toLocaleDateString("en-IN")}</span>
                        <div className="flex items-center gap-2">
                          <a
                            href={`/verify-certificate/${cert.certificateId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20 text-xs font-bold"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" /> Verify
                          </a>

                          <button
                            onClick={() => handleResendEmail(cert)}
                            disabled={isActionLoading}
                            className="p-1.5 rounded-lg bg-card border border-border text-text-muted hover:text-text cursor-pointer"
                            title="Resend Email"
                          >
                            <Mail className="w-3.5 h-3.5" />
                          </button>

                          {isSuperAdmin && (
                            <button
                              onClick={() => handleDeleteCertificate(cert)}
                              disabled={isActionLoading}
                              className="p-1.5 rounded-lg bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30 cursor-pointer"
                              title="Delete Certificate"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer Pagination Bar */}
        {pagination.totalPages > 1 && (
          <div className="p-4 border-t border-border/60 flex items-center justify-between text-xs text-text-muted bg-card-hover/50 shrink-0">
            <span className="font-mono">
              Page <span className="text-text font-bold">{pagination.page}</span> of {pagination.totalPages} ({pagination.total} records)
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-4 py-2 rounded-xl border border-border bg-card text-text disabled:opacity-50 font-mono text-xs font-bold hover:bg-card-hover transition-colors cursor-pointer"
              >
                Previous
              </button>
              <button
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-4 py-2 rounded-xl border border-border bg-card text-text disabled:opacity-50 font-mono text-xs font-bold hover:bg-card-hover transition-colors cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (isModal) {
    return createPortal(
      <div className="fixed inset-0 z-[99999] bg-panel/80 backdrop-blur-md flex items-center justify-center p-2.5 sm:p-4 md:p-6 overflow-hidden animate-fadeIn">
        <div className="w-full max-w-6xl max-h-[90vh] sm:max-h-[92vh] bg-card/95 backdrop-blur-2xl border border-border/80 rounded-2xl shadow-2xl relative flex flex-col overflow-hidden p-4 sm:p-6 md:p-8 space-y-4">
          <div className="flex justify-between items-center pb-3 border-b border-border/60 gap-3 shrink-0">
            <h2 className="text-xl sm:text-2xl font-display font-black text-text uppercase flex items-center gap-2 min-w-0 truncate tracking-tight">
              <Award className="w-6 h-6 text-teal-400 shrink-0" />
              <span className="truncate">ISSUED CERTIFICATES ARCHIVE</span>
            </h2>
            <button
              onClick={onClose}
              className="p-1.5 text-text-muted hover:text-text hover:bg-card-hover rounded-xl border border-border/60 transition-colors cursor-pointer shrink-0"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          {containerContent}
        </div>
      </div>,
      document.body
    );
  }

  return containerContent;
}
