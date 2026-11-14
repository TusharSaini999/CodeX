import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Award,
  CheckCircle2,
  XCircle,
  X,
  Clock,
  Search,
  Eye,
  RefreshCw,
  Loader2,
  AlertTriangle,
  AlertCircle,
  User,
  Calendar,
  Mail,
  ShieldCheck,
  ChevronRight,
  Filter,
  Edit3,
  Plus,
  Trash2,
  Lock,
  Upload,
  Download,
  Save,
  Image as ImageIcon,
} from "lucide-react";
import { certificateService } from "../../../services/certificateService";
import { useConfirm } from "../../../context/ConfirmContext";
import { parseCertificateCsv, downloadCertificateCsvTemplate } from "../../../utils/csvParser";

export default function CertificateBatchesSection({ isSuperAdmin, onSwitchToCreate }) {
  const confirm = useConfirm();
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [rejectModalBatch, setRejectModalBatch] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [feedback, setFeedback] = useState({ type: "", text: "" });

  // Batch Editing State
  const [editingBatch, setEditingBatch] = useState(null);
  const [editForm, setEditForm] = useState({
    eventName: "",
    eventDate: "",
    coordinatorName: "",
    signatureImageUrl: "",
    signatureFile: null,
    students: [],
  });
  const [editLoading, setEditLoading] = useState(false);
  const [editFilePreview, setEditFilePreview] = useState(null);
  const [modalNotice, setModalNotice] = useState(null);
  const editCsvInputRef = useRef(null);

  const fetchBatches = useCallback(async () => {
    setLoading(true);
    try {
      const response = await certificateService.getCertificateBatches({
        status: statusFilter === "ALL" ? undefined : statusFilter,
      });
      if (response.data) {
        setBatches(response.data.batches || []);
      }
    } catch (err) {
      console.error("Failed to load certificate batches:", err);
      setFeedback({
        type: "error",
        text: err.response?.data?.message || "Failed to load certificate batches.",
      });
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  // View full details of a batch (including full students list)
  const handleViewDetails = async (batchSummary) => {
    try {
      const response = await certificateService.getCertificateBatchById(batchSummary._id);
      setSelectedBatch(response.data || batchSummary);
      setStudentSearch("");
    } catch {
      setSelectedBatch(batchSummary);
    }
  };

  // Approve Batch (Super Admin only)
  const handleApprove = async (batch) => {
    const isConfirmed = await confirm({
      title: "Approve Certificate Batch",
      message: `Authorize and immediately trigger cryptographic generation for "${batch.eventName}" (${batch.studentCount} certificates)? Emails will be dispatched to students automatically.`,
    });

    if (!isConfirmed) return;

    setActionLoadingId(batch._id);
    try {
      const response = await certificateService.approveCertificateBatch(batch._id);
      setFeedback({
        type: "success",
        text: response.message || `Batch #${batch.batchId} approved successfully! Queue processing started.`,
      });
      if (selectedBatch && selectedBatch._id === batch._id) {
        setSelectedBatch(null);
      }
      fetchBatches();
    } catch (err) {
      setFeedback({
        type: "error",
        text: err.response?.data?.message || "Failed to approve certificate batch.",
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Submit Rejection (Super Admin only - PENDING_APPROVAL batches only)
  const handleConfirmReject = async (e) => {
    e.preventDefault();
    if (!rejectModalBatch) return;

    if (rejectModalBatch.status !== "PENDING_APPROVAL") {
      setFeedback({
        type: "error",
        text: "Approved certificate batches cannot be rejected.",
      });
      setRejectModalBatch(null);
      return;
    }

    setActionLoadingId(rejectModalBatch._id);
    try {
      const response = await certificateService.rejectCertificateBatch(
        rejectModalBatch._id,
        rejectReason
      );
      setFeedback({
        type: "success",
        text: response.message || `Batch #${rejectModalBatch.batchId} rejected.`,
      });
      setRejectModalBatch(null);
      setRejectReason("");
      if (selectedBatch && selectedBatch._id === rejectModalBatch._id) {
        setSelectedBatch(null);
      }
      fetchBatches();
    } catch (err) {
      setFeedback({
        type: "error",
        text: err.response?.data?.message || "Failed to reject certificate batch.",
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Open Edit Modal for a batch (fetch full batch to get student list if not present)
  const handleStartEdit = async (batchSummary) => {
    if (!isSuperAdmin && batchSummary.status !== "PENDING_APPROVAL") {
      setFeedback({
        type: "error",
        text: `Batch #${batchSummary.batchId} is already ${batchSummary.status} and cannot be modified. Only Super Admins can edit approved batches.`,
      });
      return;
    }

    try {
      setActionLoadingId(batchSummary._id);
      const res = await certificateService.getCertificateBatchById(batchSummary._id);
      const fullBatch = res.data || batchSummary;
      setModalNotice(null);
      setEditingBatch(fullBatch);
      setEditForm({
        eventName: fullBatch.eventName || "",
        eventDate: fullBatch.eventDate ? fullBatch.eventDate.split("T")[0] : "",
        coordinatorName: fullBatch.coordinatorName || "",
        signatureImageUrl: fullBatch.signatureImage || "",
        signatureFile: null,
        students: (fullBatch.students || []).map((s) => ({
          name: s.name || "",
          email: s.email || "",
          position: s.position || "Participant",
          isOriginal: fullBatch.status !== "PENDING_APPROVAL",
        })),
      });
      setEditFilePreview(fullBatch.signatureImage || null);
    } catch (err) {
      setFeedback({
        type: "error",
        text: err?.response?.data?.message || err?.message || "Failed to load batch details for editing.",
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleAddEditStudent = () => {
    setEditForm((prev) => ({
      ...prev,
      students: [...prev.students, { name: "", email: "", position: "Participant", isOriginal: false }],
    }));
  };

  const handleRemoveEditStudent = (index) => {
    const studentToRemove = editForm.students[index];
    if (editingBatch?.status !== "PENDING_APPROVAL" && studentToRemove?.isOriginal) {
      setFeedback({
        type: "error",
        text: "Cannot remove previously approved members from this batch. You may only edit details or add new members.",
      });
      return;
    }

    if (editForm.students.length <= 1) {
      setFeedback({ type: "error", text: "A batch must have at least one student." });
      return;
    }
    setEditForm((prev) => ({
      ...prev,
      students: prev.students.filter((_, idx) => idx !== index),
    }));
  };

  const handleEditStudentChange = (index, field, value) => {
    setEditForm((prev) => {
      const updated = [...prev.students];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, students: updated };
    });
  };

  const handleEditCsvUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target.result;
        const {
          success,
          students,
          skippedCount,
          skippedRows,
          skippedDetails,
          error,
        } = parseCertificateCsv(text);

        if (!success) {
          const errMsg = error || "Could not parse valid student records from CSV.";
          setFeedback({ type: "error", text: errMsg });
          setModalNotice({
            type: "error",
            title: "CSV Import Failed",
            details: errMsg,
          });
          return;
        }

        // Check for duplicates between CSV and existing students in the edit modal
        const existingMap = new Map();
        editForm.students.forEach((s, idx) => {
          if (s.email?.trim()) {
            existingMap.set(s.email.trim().toLowerCase(), { name: s.name?.trim(), row: idx + 1 });
          }
        });

        const overlaps = [];
        students.forEach((s) => {
          if (existingMap.has(s.email.toLowerCase())) {
            const ex = existingMap.get(s.email.toLowerCase());
            overlaps.push(
              ex.name?.toLowerCase() !== s.name?.toLowerCase()
                ? `• Email "${s.email}" in CSV conflicts with existing batch member "${ex.name}" (Row ${ex.row})`
                : `• Email "${s.email}" already exists in this batch on Row ${ex.row}`
            );
          }
        });

        if (overlaps.length > 0) {
          const more = overlaps.length > 5 ? `\n...and ${overlaps.length - 5} more conflict(s).` : '';
          const conflictMsg = `Cannot import CSV records due to duplicate emails with existing batch entries:\n${overlaps.slice(0, 5).join('\n')}${more}`;
          setFeedback({
            type: "error",
            text: conflictMsg,
          });
          setModalNotice({
            type: "error",
            title: "Duplicate Email Conflict with Batch Members",
            details: conflictMsg,
          });
          return;
        }

        setEditForm((prev) => ({
          ...prev,
          students: [...prev.students, ...students],
        }));

        let msg = `Successfully imported ${students.length} student(s) from CSV.`;
        if (skippedCount > 0) {
          const warningDetails = `Imported ${students.length} student(s), but skipped ${skippedCount} invalid row(s):\n${skippedDetails}\n\nPlease check these entries and add them manually if needed.`;
          setFeedback({ type: "warning", text: warningDetails });
          setModalNotice({
            type: "warning",
            title: `Imported ${students.length} student(s) • ${skippedCount} Invalid Row(s) Skipped`,
            details: skippedDetails,
          });
        } else {
          setFeedback({ type: "success", text: msg });
          setModalNotice({
            type: "success",
            title: "CSV Import Complete",
            details: msg,
          });
        }
      } catch (err) {
        setFeedback({ type: "error", text: "Failed to parse CSV file." });
        setModalNotice({
          type: "error",
          title: "CSV Parsing Error",
          details: "Failed to parse CSV file.",
        });
      }
    };
    reader.readAsText(file);
    e.target.value = null;
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingBatch) return;

    if (!editForm.eventName.trim()) {
      setFeedback({ type: "error", text: "Event name is required." });
      return;
    }
    if (!editForm.eventDate) {
      setFeedback({ type: "error", text: "Event date is required." });
      return;
    }
    if (!editForm.coordinatorName.trim()) {
      setFeedback({ type: "error", text: "Coordinator name is required." });
      return;
    }

    const validStudents = editForm.students.filter(
      (s) => s.name?.trim() && s.email?.trim()
    );

    if (validStudents.length === 0) {
      setFeedback({ type: "error", text: "At least one valid student record is required." });
      return;
    }

    // Check for duplicate emails / conflicting names: Halt update if conflicts exist
    const emailMap = new Map();
    const conflictList = [];

    for (let i = 0; i < validStudents.length; i++) {
      const s = validStudents[i];
      const email = s.email.trim().toLowerCase();
      const name = s.name.trim();

      if (emailMap.has(email)) {
        const existing = emailMap.get(email);
        if (existing.name.toLowerCase() !== name.toLowerCase()) {
          conflictList.push(
            `Email "${email}" is assigned to conflicting names: "${existing.name}" (Row ${existing.index + 1}) and "${name}" (Row ${i + 1})`
          );
        } else {
          conflictList.push(
            `Duplicate email "${email}" found on Row ${existing.index + 1} and Row ${i + 1}`
          );
        }
      } else {
        emailMap.set(email, { name, index: i });
      }
    }

    if (conflictList.length > 0) {
      const detailList = conflictList.slice(0, 4).map((c) => `• ${c}`).join('\n');
      const more = conflictList.length > 4 ? `\n...and ${conflictList.length - 4} more conflict(s).` : '';
      const conflictMsg = `Cannot update batch due to duplicate email conflict:\n${detailList}${more}\n\nEach student must have a unique email address.`;
      setFeedback({
        type: "error",
        text: conflictMsg,
      });
      setModalNotice({
        type: "error",
        title: "Duplicate Email Conflict",
        details: conflictMsg,
      });
      return;
    }

    setEditLoading(true);
    try {
      const submitData = new FormData();
      submitData.append("eventName", editForm.eventName.trim());
      submitData.append("eventDate", editForm.eventDate);
      submitData.append("coordinatorName", editForm.coordinatorName.trim());
      submitData.append("studentsStr", JSON.stringify(validStudents));

      if (editForm.signatureFile) {
        submitData.append("signatureImage", editForm.signatureFile);
      } else if (editForm.signatureImageUrl) {
        submitData.append("signatureImageUrl", editForm.signatureImageUrl);
      }

      const res = await certificateService.updateCertificateBatch(editingBatch._id, submitData);
      setFeedback({
        type: "success",
        text: res.message || `Batch #${editingBatch.batchId} updated successfully.`,
      });

      if (selectedBatch && selectedBatch._id === editingBatch._id) {
        setSelectedBatch(res.data || null);
      }
      setEditingBatch(null);
      setModalNotice(null);
      fetchBatches();
    } catch (err) {
      const errMsg = err?.response?.data?.message || err?.message || "Failed to update batch.";
      setFeedback({
        type: "error",
        text: errMsg,
      });
      setModalNotice({
        type: "error",
        title: "Update Failed",
        details: errMsg,
      });
    } finally {
      setEditLoading(false);
    }
  };

  // Export Batch to CSV (with smart fallback to batch student roster if server CSV is header-only)
  const handleExportCsv = async (batch) => {
    try {
      setActionLoadingId(batch._id);
      let csvBlob = null;

      try {
        const res = await certificateService.exportBatchCertificates(batch._id);
        const rawData =
          res instanceof Blob
            ? res
            : res?.data instanceof Blob
            ? res.data
            : res?.data !== undefined
            ? res.data
            : res;
        const text =
          rawData instanceof Blob
            ? await rawData.text()
            : typeof rawData === "string"
            ? rawData
            : "";
        const lineCount = text.trim().split(/\r?\n/).length;

        // If server produced at least 2 lines (header + 1 record)
        if (lineCount > 1) {
          csvBlob = new Blob([text], { type: "text/csv;charset=utf-8;" });
        }
      } catch (serverErr) {
        console.warn("Backend export endpoint failed, falling back to batch roster:", serverErr);
      }

      // Fallback: If server CSV is empty or header-only, construct CSV from batch students
      if (!csvBlob) {
        let studentsList = batch.students || [];
        if (studentsList.length === 0) {
          try {
            const detailRes = await certificateService.getCertificateBatchById(batch._id);
            studentsList = detailRes.data?.students || [];
          } catch {
            studentsList = [];
          }
        }

        const rows = [
          ["Student Name", "Email", "Position", "Certificate ID", "Verification Link", "Status"]
        ];

        studentsList.forEach((s) => {
          const certId = s.certificateId || (batch.status === "COMPLETED" ? "GENERATED" : "PENDING");
          const verifyUrl = s.certificateId ? `${window.location.origin}/verify-certificate/${s.certificateId}` : "";
          rows.push([
            `"${(s.name || "").replace(/"/g, '""')}"`,
            `"${(s.email || "").replace(/"/g, '""')}"`,
            `"${(s.position || "Participant").replace(/"/g, '""')}"`,
            `"${certId}"`,
            `"${verifyUrl}"`,
            `"${batch.status || "COMPLETED"}"`
          ]);
        });

        const csvString = "\uFEFF" + rows.map((r) => r.join(",")).join("\r\n");
        csvBlob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
      }

      const url = window.URL.createObjectURL(csvBlob);
      const link = document.createElement("a");
      link.href = url;
      const sanitizedName = (batch.eventName || "batch").replace(/[^a-zA-Z0-9_-]/g, "_");
      link.setAttribute("download", `Certificates_${sanitizedName}_${batch.batchId || batch._id}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      setFeedback({
        type: "success",
        text: `Exported certificates for "${batch.eventName}" successfully!`,
      });
    } catch (err) {
      setFeedback({
        type: "error",
        text: err.response?.data?.message || err.message || "Failed to export certificates CSV.",
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Filtered batches
  const filteredBatches = useMemo(() => {
    return batches.filter((b) => {
      if (statusFilter !== "ALL" && b.status !== statusFilter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        (b.batchId && b.batchId.toLowerCase().includes(q)) ||
        (b.eventName && b.eventName.toLowerCase().includes(q)) ||
        (b.coordinatorName && b.coordinatorName.toLowerCase().includes(q)) ||
        (b.submittedByName && b.submittedByName.toLowerCase().includes(q)) ||
        (b.submittedByEmail && b.submittedByEmail.toLowerCase().includes(q))
      );
    });
  }, [batches, statusFilter, searchQuery]);

  // Metrics
  const metrics = useMemo(() => {
    const total = batches.length;
    const pending = batches.filter((b) => b.status === "PENDING_APPROVAL").length;
    const processing = batches.filter((b) => b.status === "PROCESSING" || b.status === "APPROVED").length;
    const completed = batches.filter((b) => b.status === "COMPLETED").length;
    const rejected = batches.filter((b) => b.status === "REJECTED").length;
    return { total, pending, processing, completed, rejected };
  }, [batches]);

  const renderStatusBadge = (status, batch) => {
    switch (status) {
      case "PENDING_APPROVAL":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 whitespace-nowrap">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber-400 animate-ping shrink-0" />
            Pending Review
          </span>
        );
      case "APPROVED":
      case "PROCESSING": {
        const total = batch?.studentCount || 1;
        const gen = batch?.generatedCount || 0;
        const pct = Math.min(100, Math.round((gen / total) * 100));
        return (
          <div className="space-y-1 min-w-[100px] sm:min-w-[120px]">
            <div className="flex items-center justify-between text-[10px] font-mono">
              <span className="inline-flex items-center gap-1.5 font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse shrink-0" />
                Generating
              </span>
              <span className="text-text-muted font-bold">{gen}/{total}</span>
            </div>
            <div className="w-full h-1.5 bg-card border border-border/60 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${Math.max(6, pct)}%` }}
              />
            </div>
          </div>
        );
      }
      case "COMPLETED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-accent/15 text-accent border border-accent/30 whitespace-nowrap">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            Completed
          </span>
        );
      case "FAILED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30 whitespace-nowrap">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            Failed
          </span>
        );
      case "REJECTED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30 whitespace-nowrap">
            <XCircle className="w-3.5 h-3.5 shrink-0" />
            Rejected
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-card border border-border text-text-muted whitespace-nowrap">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Feedback banner */}
      {feedback.text && (
        <div
          className={`flex items-center justify-between gap-3 p-4 rounded-xl text-xs font-mono font-bold border transition-all ${
            feedback.type === "success"
              ? "bg-accent/15 text-accent border-accent/40"
              : feedback.type === "warning"
              ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/40"
              : "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/40"
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span className="whitespace-pre-line">{feedback.text}</span>
          </div>
          <button
            onClick={() => setFeedback({ type: "", text: "" })}
            className="text-text-muted hover:text-text cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="bg-card/85 backdrop-blur-xl border border-border/80 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[11px] font-mono font-bold text-text-muted uppercase">Total Requests</div>
            <div className="text-xl sm:text-2xl font-display font-black text-text mt-0.5">{metrics.total}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent">
            <Award className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-card/85 backdrop-blur-xl border border-border/80 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[11px] font-mono font-bold text-amber-700 dark:text-amber-400 uppercase">Pending Review</div>
            <div className="text-xl sm:text-2xl font-display font-black text-amber-700 dark:text-amber-400 mt-0.5">{metrics.pending}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 dark:bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-700 dark:text-amber-400">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-card/85 backdrop-blur-xl border border-border/80 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[11px] font-mono font-bold text-emerald-700 dark:text-emerald-400 uppercase">Generating</div>
            <div className="text-xl sm:text-2xl font-display font-black text-emerald-700 dark:text-emerald-400 mt-0.5">{metrics.processing}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 dark:bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-700 dark:text-emerald-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-card/85 backdrop-blur-xl border border-border/80 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[11px] font-mono font-bold text-accent uppercase">Completed</div>
            <div className="text-xl sm:text-2xl font-display font-black text-accent mt-0.5">{metrics.completed}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-accent/15 border border-accent/25 flex items-center justify-center text-accent">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-card/85 backdrop-blur-xl border border-border/80 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[11px] font-mono font-bold text-rose-700 dark:text-rose-400 uppercase">Rejected</div>
            <div className="text-xl sm:text-2xl font-display font-black text-rose-700 dark:text-rose-400 mt-0.5">{metrics.rejected}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-500/15 dark:bg-rose-500/10 border border-rose-500/25 flex items-center justify-center text-rose-700 dark:text-rose-400">
            <XCircle className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="bg-card/85 backdrop-blur-xl rounded-2xl border border-border/80 shadow-xl overflow-hidden flex flex-col">
        {/* Controls Bar */}
        <div className="p-3.5 sm:p-4 border-b border-border/60 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-card-hover/30">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-text-muted pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by event, batch ID, admin name..."
              className="w-full bg-card border border-border/80 rounded-xl pl-10 pr-4 py-2 text-xs font-mono text-text focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent transition-all placeholder:text-text-muted/50"
            />
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar pb-1 sm:pb-0">
            <Filter className="w-3.5 h-3.5 text-text-muted shrink-0" />
            {["ALL", "PENDING_APPROVAL", "PROCESSING", "COMPLETED", "REJECTED"].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-mono font-bold uppercase transition-all whitespace-nowrap cursor-pointer shrink-0 ${statusFilter === st
                    ? "bg-accent text-[#111111] shadow-sm shadow-accent/20"
                    : "bg-card hover:bg-card-hover border border-border/80 text-text-muted hover:text-text"
                  }`}
              >
                {st === "ALL"
                  ? "All Batches"
                  : st === "PENDING_APPROVAL"
                    ? "Pending Review"
                    : st === "PROCESSING"
                      ? "Generating"
                      : st === "COMPLETED"
                        ? "Completed"
                        : "Rejected"}
              </button>
            ))}

            <button
              onClick={fetchBatches}
              className="p-2 rounded-xl bg-card border border-border/80 text-text-muted hover:text-accent hover:bg-card-hover transition-all cursor-pointer ml-1 shrink-0"
              title="Refresh Batches"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Batches Table */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-8 h-8 text-accent animate-spin" />
              <span className="text-xs font-mono text-text-muted uppercase tracking-wider">
                Loading certificate batches...
              </span>
            </div>
          ) : filteredBatches.length === 0 ? (
            <div className="py-20 text-center space-y-3">
              <Award className="w-12 h-12 text-text-muted/40 mx-auto" />
              <div className="text-sm font-display font-bold text-text">No certificate batches found</div>
              <p className="text-xs text-text-muted max-w-sm mx-auto">
                {statusFilter === "PENDING_APPROVAL"
                  ? "No batches currently awaiting Super Admin review."
                  : "No certificate generation batches have been submitted yet."}
              </p>
              {onSwitchToCreate && (
                <button
                  onClick={onSwitchToCreate}
                  className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-accent/15 text-accent border border-accent/30 text-xs font-mono font-bold hover:bg-accent/25 transition-all cursor-pointer"
                >
                  Create New Batch Request
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Desktop Table View - Streamlined to Essential Info Only */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full text-left border-collapse whitespace-nowrap">
                  <thead>
                    <tr className="border-b border-border/60 bg-card/60 text-[11px] font-mono uppercase text-text-muted tracking-wider">
                      <th className="py-3 px-4 pl-6 font-bold">Event & Batch</th>
                      <th className="py-3 px-4 font-bold">By</th>
                      <th className="py-3 px-4 font-bold">Students</th>
                      <th className="py-3 px-4 font-bold">Status</th>
                      <th className="py-3 px-4 pr-6 font-bold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40 text-xs font-sans">
                    {filteredBatches.map((batch) => {
                      const isPending = batch.status === "PENDING_APPROVAL";
                      const isActionLoading = actionLoadingId === batch._id;

                      return (
                        <tr
                          key={batch._id}
                          className="hover:bg-card-hover/40 transition-colors group"
                        >
                          {/* Batch ID & Event */}
                          <td className="py-3 px-4 pl-6">
                            <div className="flex items-center gap-2">
                              <span className="font-display font-bold text-sm text-text">
                                {batch.eventName}
                              </span>
                              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-accent/10 border border-accent/20 text-accent font-semibold">
                                #{batch.batchId?.slice(-6) || batch.batchId}
                              </span>
                            </div>
                            <div className="text-[11px] text-text-muted font-mono mt-0.5">
                              {batch.eventDate ? new Date(batch.eventDate).toLocaleDateString("en-IN") : "—"}
                            </div>
                          </td>

                          {/* Submitted By - compact */}
                          <td className="py-3 px-4">
                            <div className="font-semibold text-text text-xs flex items-center gap-1.5">
                              <User className="w-3.5 h-3.5 text-accent shrink-0" />
                              <span>{batch.submittedByName || "Admin"}</span>
                            </div>
                          </td>

                          {/* Students Count */}
                          <td className="py-3 px-4">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-card border border-border/70 font-mono text-xs font-bold text-text">
                              <Award className="w-3.5 h-3.5 text-accent" />
                              <span>{batch.studentCount || 0}</span>
                            </span>
                          </td>

                          {/* Status */}
                          <td className="py-3 px-4">
                            {renderStatusBadge(batch.status, batch)}
                          </td>

                          {/* Actions - clean icons with text */}
                          <td className="py-3 px-4 pr-6 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleViewDetails(batch)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-card border border-border text-text-muted hover:text-text hover:bg-card-hover text-xs font-mono transition-all cursor-pointer"
                                title="Inspect Batch Details & Student Roster"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Details</span>
                              </button>

                              {(batch.status === "COMPLETED" || batch.status === "PROCESSING" || (batch.generatedCount && batch.generatedCount > 0)) && (
                                <button
                                  onClick={() => handleExportCsv(batch)}
                                  disabled={isActionLoading}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-card border border-border text-text-muted hover:text-accent hover:bg-card-hover text-xs font-mono transition-all cursor-pointer"
                                  title="Export CSV"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  <span>CSV</span>
                                </button>
                              )}

                              {(isPending || isSuperAdmin) && (
                                <button
                                  onClick={() => handleStartEdit(batch)}
                                  disabled={isActionLoading}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-accent/15 text-accent border border-accent/30 hover:bg-accent/25 text-xs font-mono font-bold transition-all disabled:opacity-50 cursor-pointer"
                                  title="Edit batch details or add members"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                  <span>Edit</span>
                                </button>
                              )}

                              {isSuperAdmin && isPending && (
                                <button
                                  onClick={() => handleApprove(batch)}
                                  disabled={isActionLoading}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 text-xs font-mono font-bold transition-all disabled:opacity-50 cursor-pointer shadow-sm"
                                  title="Approve batch"
                                >
                                  {isActionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                                  <span>Approve</span>
                                </button>
                              )}

                              {isSuperAdmin && isPending && (
                                <button
                                  onClick={() => {
                                    setRejectModalBatch(batch);
                                    setRejectReason("");
                                  }}
                                  disabled={isActionLoading}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 hover:bg-rose-500/25 text-xs font-mono font-bold transition-all disabled:opacity-50 cursor-pointer"
                                  title="Reject batch request"
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                  <span>Reject</span>
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

              {/* Tablet & Mobile Cards View (below lg screen) - clean, compact, essential only */}
              <div className="block lg:hidden divide-y divide-border/40">
                {filteredBatches.map((batch) => {
                  const isPending = batch.status === "PENDING_APPROVAL";
                  const isActionLoading = actionLoadingId === batch._id;

                  return (
                    <div key={batch._id} className="p-3.5 sm:p-4 space-y-3">
                      {/* Row 1: Batch ID & Status Badge */}
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="font-mono text-[11px] sm:text-xs font-bold text-accent bg-accent/10 px-2 py-0.5 rounded border border-accent/20">
                          #{batch.batchId}
                        </span>
                        <div className="shrink-0">
                          {renderStatusBadge(batch.status, batch)}
                        </div>
                      </div>

                      {/* Row 2: Event Title & Date / Coordinator */}
                      <div>
                        <h4 className="font-display font-bold text-sm sm:text-base text-text">
                          {batch.eventName}
                        </h4>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-text-muted font-mono mt-1">
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="w-3 h-3 shrink-0 text-text-muted" />
                            {batch.eventDate
                              ? new Date(batch.eventDate).toLocaleDateString("en-IN")
                              : "—"}
                          </span>
                          <span>•</span>
                          <span className="truncate">Coord: {batch.coordinatorName}</span>
                        </div>
                      </div>

                      {/* Info Grid */}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-card p-2 rounded-xl border border-border/60">
                          <span className="text-[10px] text-text-muted uppercase font-mono block">Submitted By</span>
                          <span className="font-bold text-text truncate block mt-0.5 text-xs">{batch.submittedByName || "Admin"}</span>
                        </div>
                        <div className="bg-card p-2 rounded-xl border border-border/60">
                          <span className="text-[10px] text-text-muted uppercase font-mono block">Students</span>
                          <span className="font-bold text-text block mt-0.5 text-xs">{batch.studentCount || 0} records</span>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex flex-wrap items-center justify-end gap-1.5 pt-2 border-t border-border/40">
                        <button
                          onClick={() => handleViewDetails(batch)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-card border border-border text-text-muted hover:text-text text-xs font-mono transition-all cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Details</span>
                        </button>

                        {(batch.status === "COMPLETED" || batch.status === "PROCESSING" || (batch.generatedCount && batch.generatedCount > 0)) && (
                          <button
                            onClick={() => handleExportCsv(batch)}
                            disabled={isActionLoading}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-card border border-border text-text-muted hover:text-accent text-xs font-mono transition-all cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>CSV</span>
                          </button>
                        )}

                        {(isPending || isSuperAdmin) && (
                          <button
                            onClick={() => handleStartEdit(batch)}
                            disabled={isActionLoading}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-accent/15 text-accent border border-accent/30 hover:bg-accent/25 text-xs font-mono font-bold transition-all disabled:opacity-50 cursor-pointer shadow-sm"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>
                        )}

                        {isSuperAdmin && (
                          <>
                            {isPending && (
                              <button
                                onClick={() => handleApprove(batch)}
                                disabled={isActionLoading}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 text-xs font-mono font-bold transition-all disabled:opacity-50 cursor-pointer"
                              >
                                {isActionLoading ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                )}
                                <span>Approve</span>
                              </button>
                            )}

                            {isPending && (
                              <button
                                onClick={() => {
                                  setRejectModalBatch(batch);
                                  setRejectReason("");
                                }}
                                disabled={isActionLoading}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30 text-xs font-mono font-bold transition-all disabled:opacity-50 cursor-pointer"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                <span>Reject</span>
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ================= DETAILS MODAL (Viewport Constrained: Centered, Zero Outer-Scroll, Pinned Controls) ================= */}
      {selectedBatch && createPortal(
        <div className="fixed inset-0 z-[99999] bg-panel/80 backdrop-blur-md flex items-center justify-center p-2.5 sm:p-4 md:p-6 overflow-hidden animate-fadeIn">
          <div className="w-full max-w-4xl max-h-[90vh] sm:max-h-[92vh] bg-card/95 backdrop-blur-2xl border border-border/80 rounded-2xl shadow-2xl relative flex flex-col overflow-hidden">
            {/* Pinned Modal Header */}
            <div className="p-3.5 sm:p-5 pb-3 border-b border-border/60 shrink-0">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-accent/10 border border-accent/30 text-accent font-mono text-[10px] sm:text-[11px] font-bold uppercase tracking-wider mb-1 shadow-sm">
                    <Award className="w-3 h-3" />
                    <span>BATCH #{selectedBatch.batchId}</span>
                  </div>
                  <h2 className="text-base sm:text-xl font-display font-black uppercase text-text tracking-tight truncate">
                    {selectedBatch.eventName}
                  </h2>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleExportCsv(selectedBatch)}
                    disabled={actionLoadingId === selectedBatch._id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-card border border-border text-xs font-mono font-bold text-text hover:text-accent hover:bg-card-hover transition-colors cursor-pointer shadow-sm"
                    title="Export issued certificates to CSV"
                  >
                    <Download className="w-3.5 h-3.5 text-accent" />
                    <span>Export CSV</span>
                  </button>
                  <button
                    onClick={() => setSelectedBatch(null)}
                    className="p-1.5 text-text-muted hover:text-text hover:bg-card-hover rounded-xl border border-border/60 transition-colors cursor-pointer"
                    aria-label="Close modal"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Scrollable Internal Body (fits without outer window scroll) */}
            <div className="p-3.5 sm:p-5 flex-1 overflow-y-auto space-y-3">
              {/* Batch Info Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 p-2.5 sm:p-3 rounded-xl bg-card-hover/40 border border-border/60 text-xs font-mono shrink-0">
                <div>
                  <span className="text-text-muted block text-[10px] uppercase font-bold">Status</span>
                  <div className="mt-0.5">{renderStatusBadge(selectedBatch.status, selectedBatch)}</div>
                </div>
                <div>
                  <span className="text-text-muted block text-[10px] uppercase font-bold">Coordinator</span>
                  <span className="font-bold text-text mt-0.5 block truncate text-xs">{selectedBatch.coordinatorName}</span>
                </div>
                <div>
                  <span className="text-text-muted block text-[10px] uppercase font-bold">Total Students</span>
                  <span className="font-bold text-text mt-0.5 block text-xs">{selectedBatch.studentCount}</span>
                </div>
                <div>
                  <span className="text-text-muted block text-[10px] uppercase font-bold">Generated</span>
                  <span className="font-bold text-emerald-700 dark:text-emerald-400 mt-0.5 block text-xs">
                    {selectedBatch.generatedCount ?? (selectedBatch.status === "COMPLETED" ? selectedBatch.studentCount : 0)} / {selectedBatch.studentCount}
                  </span>
                </div>
                <div>
                  <span className="text-text-muted block text-[10px] uppercase font-bold">Failed</span>
                  <span className={`font-bold mt-0.5 block text-xs ${selectedBatch.failedCount > 0 ? "text-rose-500" : "text-text-muted"}`}>
                    {selectedBatch.failedCount || 0}
                  </span>
                </div>
                <div>
                  <span className="text-text-muted block text-[10px] uppercase font-bold">Submitted By</span>
                  <span className="font-bold text-text mt-0.5 block truncate text-xs">{selectedBatch.submittedByName || "Admin"}</span>
                </div>
              </div>

              {/* Signature Preview */}
              {selectedBatch.signatureImage && (
                <div className="p-2.5 sm:p-3 rounded-xl bg-card border border-border flex items-center justify-between gap-3 shrink-0">
                  <span className="text-xs font-mono font-bold text-text uppercase">
                    Coordinator Signature:
                  </span>
                  <img
                    src={selectedBatch.signatureImage}
                    alt="Signature"
                    className="h-8 sm:h-9 max-w-[140px] sm:max-w-[160px] object-contain rounded bg-white/10 p-1 border border-border/50"
                  />
                </div>
              )}

              {/* Student Search & List */}
              <div className="flex-1 flex flex-col space-y-2 min-h-[140px]">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0">
                  <span className="text-xs font-mono font-bold text-text uppercase">
                    Student Roster ({selectedBatch.students?.length || selectedBatch.studentCount || 0})
                  </span>
                  <input
                    type="text"
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    placeholder="Filter students in batch..."
                    className="w-full sm:w-auto px-3 py-1 bg-card border border-border/80 rounded-lg text-xs font-mono text-text focus:outline-none focus:ring-1 focus:ring-accent placeholder:text-text-muted/60"
                  />
                </div>

                {/* Roster Container */}
                <div className="overflow-y-auto flex-1 rounded-xl border border-border/60 bg-card/60 max-h-[280px]">
                  {(!selectedBatch.students || selectedBatch.students.length === 0) ? (
                    <div className="p-6 text-center text-text-muted font-sans text-xs">
                      No student records in this batch.
                    </div>
                  ) : (
                    <>
                      {/* Desktop / Tablet Table View */}
                      <table className="hidden sm:table w-full text-left text-xs border-collapse">
                        <thead className="bg-card-hover/80 border-b border-border/60 text-[10px] font-mono uppercase text-text-muted sticky top-0 backdrop-blur-sm z-10">
                          <tr>
                            <th className="p-2 pl-3.5 w-12">#</th>
                            <th className="p-2">Student Name</th>
                            <th className="p-2">Email Address</th>
                            <th className="p-2 pr-3.5 text-right">Award / Position</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/30 font-mono">
                          {selectedBatch.students
                            .filter((s) => {
                              if (!studentSearch.trim()) return true;
                              const sq = studentSearch.toLowerCase();
                              return (
                                (s.name && s.name.toLowerCase().includes(sq)) ||
                                (s.email && s.email.toLowerCase().includes(sq)) ||
                                (s.position && s.position.toLowerCase().includes(sq))
                              );
                            })
                            .map((student, idx) => (
                              <tr key={idx} className="hover:bg-card-hover/40 transition-colors">
                                <td className="p-2 pl-3.5 text-text-muted">{idx + 1}</td>
                                <td className="p-2 font-sans font-bold text-text">
                                  <div className="flex items-center gap-2">
                                    <span>{student.name}</span>
                                    {student.certificateId && (
                                      <a
                                        href={`/verify-certificate/${student.certificateId}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-[10px] text-accent hover:underline inline-flex items-center gap-0.5 font-mono font-normal"
                                        title="Verify certificate"
                                      >
                                        Verify ↗
                                      </a>
                                    )}
                                  </div>
                                  {student.certificateId && (
                                    <span className="block font-mono text-[10px] text-accent font-normal mt-0.5">
                                      #{student.certificateId}
                                    </span>
                                  )}
                                </td>
                                <td className="p-2 text-text-muted">{student.email}</td>
                                <td className="p-2 pr-3.5 text-right">
                                  <span className="inline-block px-2 py-0.5 rounded-full bg-accent/10 border border-accent/20 text-accent text-[10px] font-bold">
                                    {student.position || "Participant"}
                                  </span>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>

                      {/* Mobile Compact Cards View */}
                      <div className="sm:hidden divide-y divide-border/30 font-mono">
                        {selectedBatch.students
                          .filter((s) => {
                            if (!studentSearch.trim()) return true;
                            const sq = studentSearch.toLowerCase();
                            return (
                              (s.name && s.name.toLowerCase().includes(sq)) ||
                              (s.email && s.email.toLowerCase().includes(sq)) ||
                              (s.position && s.position.toLowerCase().includes(sq))
                            );
                          })
                          .map((student, idx) => (
                            <div key={idx} className="p-2 space-y-1 hover:bg-card-hover/30">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="text-[10px] text-text-muted font-bold">#{idx + 1}</span>
                                  <span className="font-sans font-bold text-text text-xs truncate">{student.name}</span>
                                </div>
                                <span className="shrink-0 px-2 py-0.5 rounded-full bg-accent/10 border border-accent/20 text-accent text-[10px] font-bold">
                                  {student.position || "Participant"}
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-2 text-[11px] text-text-muted">
                                <span className="truncate">{student.email}</span>
                                {student.certificateId && (
                                  <a
                                    href={`/verify-certificate/${student.certificateId}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[10px] text-accent hover:underline shrink-0"
                                  >
                                    Verify ↗
                                  </a>
                                )}
                              </div>
                              {student.certificateId && (
                                <div className="text-[10px] text-accent/80">
                                  #{student.certificateId}
                                </div>
                              )}
                            </div>
                          ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Pinned Modal Footer */}
            <div className="p-3 sm:p-4 border-t border-border/60 flex flex-wrap items-center justify-between gap-2 shrink-0 bg-card/95">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedBatch(null)}
                  className="px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-card border border-border text-xs font-mono font-bold text-text hover:bg-card-hover transition-colors cursor-pointer"
                >
                  Close
                </button>

                {/* Edit Batch & Roster button in details modal */}
                {(selectedBatch.status === "PENDING_APPROVAL" || isSuperAdmin) && (
                  <button
                    onClick={() => handleStartEdit(selectedBatch)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-accent/15 text-accent border border-accent/30 hover:bg-accent/25 text-xs font-mono font-bold transition-all cursor-pointer shadow-sm"
                    title="Edit batch event metadata or add new student recipients"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Edit Batch & Student Roster</span>
                  </button>
                )}
              </div>

              {isSuperAdmin && selectedBatch.status === "PENDING_APPROVAL" && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setRejectModalBatch(selectedBatch);
                      setRejectReason("");
                    }}
                    className="px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30 hover:bg-rose-500/25 text-xs font-mono font-bold transition-all cursor-pointer"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => handleApprove(selectedBatch)}
                    disabled={actionLoadingId === selectedBatch._id}
                    className="px-4 py-1.5 sm:px-5 sm:py-2 rounded-xl bg-emerald-500 text-black font-mono font-bold text-xs hover:bg-emerald-400 transition-all cursor-pointer shadow-lg shadow-emerald-500/20"
                  >
                    Authorize & Generate Batch
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ================= EDIT BATCH MODAL (Viewport Constrained: Centered, Zero Outer-Scroll, Pinned Controls) ================= */}
      {editingBatch && createPortal(
        <div className="fixed inset-0 z-[99999] bg-panel/80 backdrop-blur-md flex items-center justify-center p-2.5 sm:p-4 md:p-6 overflow-hidden animate-fadeIn">
          <div className="w-full max-w-4xl max-h-[90vh] sm:max-h-[92vh] bg-card/95 backdrop-blur-2xl border border-border/80 rounded-2xl shadow-2xl relative flex flex-col overflow-hidden">
            {/* Pinned Modal Header */}
            <div className="p-3.5 sm:p-5 pb-3 border-b border-border/60 shrink-0 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                {editingBatch.status === "PENDING_APPROVAL" ? (
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300 font-mono text-[10px] font-bold uppercase mb-1 shadow-sm">
                    <Clock className="w-3 h-3" />
                    <span>PENDING APPROVAL • EDIT MODE</span>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 font-mono text-[10px] font-bold uppercase mb-1 shadow-sm">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>APPROVED BATCH • EDIT DETAILS & ADD MEMBERS</span>
                  </div>
                )}
                <h2 className="text-base sm:text-xl font-display font-black uppercase text-text tracking-tight truncate">
                  EDIT BATCH #{editingBatch.batchId}
                </h2>
              </div>
              <button
                onClick={() => setEditingBatch(null)}
                className="p-1.5 text-text-muted hover:text-text hover:bg-card-hover rounded-xl border border-border/60 transition-colors cursor-pointer shrink-0"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <form onSubmit={handleSaveEdit} className="flex-1 overflow-hidden flex flex-col">
              <div className="p-3.5 sm:p-5 flex-1 overflow-y-auto space-y-3.5">
                {/* Modal In-Form Notice / Error / Warning Banner */}
                {modalNotice && (
                  <div
                    className={`flex items-start justify-between gap-3 p-3.5 rounded-xl border text-xs font-mono transition-all shrink-0 ${
                      modalNotice.type === "success"
                        ? "bg-accent/15 border-accent/40 text-accent"
                        : modalNotice.type === "warning"
                        ? "bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300"
                        : "bg-rose-500/15 border-rose-500/40 text-rose-700 dark:text-rose-300"
                    }`}
                  >
                    <div className="flex items-start gap-2.5 flex-1">
                      {modalNotice.type === "success" ? (
                        <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-accent" />
                      ) : modalNotice.type === "warning" ? (
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                      ) : (
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
                      )}
                      <div className="space-y-1 flex-1">
                        <div className="font-bold uppercase tracking-wider text-[11px]">
                          {modalNotice.title}
                        </div>
                        <div className="whitespace-pre-line text-[11px] leading-relaxed opacity-95">
                          {modalNotice.details}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setModalNotice(null)}
                      className="opacity-70 hover:opacity-100 text-xs font-bold shrink-0 cursor-pointer p-0.5"
                      title="Dismiss notice"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* Event Metadata Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 shrink-0">
                  <div>
                    <label className="text-[11px] font-mono font-bold text-text uppercase block mb-1">
                      Event Name *
                    </label>
                    <input
                      type="text"
                      value={editForm.eventName}
                      onChange={(e) => setEditForm({ ...editForm, eventName: e.target.value })}
                      required
                      className="w-full bg-card-hover/60 border border-border/80 rounded-xl p-2.5 text-xs font-sans text-text focus:outline-none focus:ring-1 focus:ring-accent transition-all"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-mono font-bold text-text uppercase block mb-1">
                      Event Date *
                    </label>
                    <input
                      type="date"
                      value={editForm.eventDate}
                      onChange={(e) => setEditForm({ ...editForm, eventDate: e.target.value })}
                      required
                      className="w-full bg-card-hover/60 border border-border/80 rounded-xl p-2.5 text-xs font-mono text-text focus:outline-none focus:ring-1 focus:ring-accent transition-all"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-mono font-bold text-text uppercase block mb-1">
                      Coordinator Name *
                    </label>
                    <input
                      type="text"
                      value={editForm.coordinatorName}
                      onChange={(e) => setEditForm({ ...editForm, coordinatorName: e.target.value })}
                      required
                      className="w-full bg-card-hover/60 border border-border/80 rounded-xl p-2.5 text-xs font-sans text-text focus:outline-none focus:ring-1 focus:ring-accent transition-all"
                    />
                  </div>
                </div>

                {/* Signature Image Edit */}
                <div className="p-2.5 sm:p-3 rounded-xl bg-card-hover/40 border border-border/60 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
                  <div className="flex items-center gap-2.5">
                    {editFilePreview ? (
                      <img
                        src={editFilePreview}
                        alt="Signature"
                        className="h-8 max-w-[120px] object-contain rounded bg-white/10 p-1 border border-border"
                      />
                    ) : (
                      <div className="h-8 w-20 rounded bg-card border border-border flex items-center justify-center text-[10px] text-text-muted">
                        No Signature
                      </div>
                    )}
                    <div>
                      <span className="text-xs font-mono font-bold text-text block">
                        Coordinator Signature
                      </span>
                      <span className="text-[10px] text-text-muted">
                        Leave unchanged or upload a replacement signature image
                      </span>
                    </div>
                  </div>

                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-card border border-border hover:bg-card-hover text-xs font-mono font-bold text-text cursor-pointer transition-colors shadow-sm">
                    <ImageIcon className="w-3.5 h-3.5 text-accent" />
                    <span>Replace Signature</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files[0];
                        if (file) {
                          setEditForm({ ...editForm, signatureFile: file });
                          setEditFilePreview(URL.createObjectURL(file));
                        }
                      }}
                    />
                  </label>
                </div>

                {/* Student Roster Header & Controls */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/40 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-text uppercase">
                      Student Roster
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-accent/15 text-accent font-mono text-[11px] font-bold">
                      {editForm.students.length} Student(s)
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <input
                      type="file"
                      accept=".csv"
                      ref={editCsvInputRef}
                      onChange={handleEditCsvUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => editCsvInputRef.current?.click()}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-card border border-border text-text hover:bg-card-hover text-xs font-mono transition-colors cursor-pointer"
                    >
                      <Upload className="w-3 h-3" />
                      <span>CSV</span>
                    </button>
                    <button
                      type="button"
                      onClick={downloadCertificateCsvTemplate}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-card border border-border text-text-muted hover:text-text hover:bg-card-hover text-xs font-mono transition-colors cursor-pointer"
                      title="Download Sample CSV Template"
                    >
                      <Download className="w-3 h-3" />
                      <span className="hidden sm:inline">Template</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleAddEditStudent}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-accent text-[#111111] font-mono text-xs font-bold hover:opacity-90 transition-opacity cursor-pointer shadow-sm"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add Student</span>
                    </button>
                  </div>
                </div>

                {/* Student Rows Table */}
                <div className="rounded-xl border border-border/60 bg-card/40 max-h-[250px] overflow-y-auto overflow-x-auto flex-1">
                  <table className="w-full text-left text-xs border-collapse min-w-[500px]">
                    <thead className="bg-card-hover/80 border-b border-border/60 text-[10px] font-mono uppercase text-text-muted sticky top-0 z-10 backdrop-blur-sm">
                      <tr>
                        <th className="p-2 pl-3 w-10">#</th>
                        <th className="p-2">Student Name *</th>
                        <th className="p-2">Email Address *</th>
                        <th className="p-2 w-40">Award / Position</th>
                        <th className="p-2 pr-3 text-right w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {editForm.students.map((student, idx) => (
                        <tr key={idx} className="hover:bg-card-hover/30">
                          <td className="p-1.5 pl-3 font-mono text-text-muted text-[11px]">
                            {idx + 1}
                          </td>
                          <td className="p-1.5">
                            <input
                              type="text"
                              value={student.name}
                              onChange={(e) => handleEditStudentChange(idx, "name", e.target.value)}
                              placeholder="Student Name"
                              required
                              className="w-full bg-card border border-border rounded-lg px-2 py-1 text-xs text-text focus:outline-none focus:ring-1 focus:ring-accent"
                            />
                          </td>
                          <td className="p-1.5">
                            <input
                              type="email"
                              value={student.email}
                              onChange={(e) => handleEditStudentChange(idx, "email", e.target.value)}
                              placeholder="student@example.com"
                              required
                              className="w-full bg-card border border-border rounded-lg px-2 py-1 text-xs font-mono text-text focus:outline-none focus:ring-1 focus:ring-accent"
                            />
                          </td>
                          <td className="p-1.5">
                            <select
                              value={student.position || "Participant"}
                              onChange={(e) => handleEditStudentChange(idx, "position", e.target.value)}
                              className="w-full bg-card border border-border rounded-lg px-2 py-1 text-xs text-text focus:outline-none focus:ring-1 focus:ring-accent"
                            >
                              <option value="Participant">Participant</option>
                              <option value="Winner">Winner</option>
                              <option value="Runner Up">Runner Up</option>
                              <option value="1st Runner-up">1st Runner-up</option>
                              <option value="2nd Runner-up">2nd Runner-up</option>
                              <option value="Volunteer">Volunteer</option>
                              <option value="Organizer">Organizer</option>
                            </select>
                          </td>
                          <td className="p-1.5 pr-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemoveEditStudent(idx)}
                              disabled={
                                editForm.students.length <= 1 ||
                                (editingBatch?.status !== "PENDING_APPROVAL" && student?.isOriginal)
                              }
                              className="p-1 rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                              title={
                                editingBatch?.status !== "PENDING_APPROVAL" && student?.isOriginal
                                  ? "Existing approved members cannot be removed"
                                  : "Remove student row"
                              }
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Pinned Form Footer */}
              <div className="p-3 sm:p-4 border-t border-border/60 flex items-center justify-end gap-2.5 shrink-0 bg-card/95">
                <button
                  type="button"
                  onClick={() => setEditingBatch(null)}
                  className="px-4 py-2 rounded-xl bg-card border border-border text-xs font-mono font-bold text-text hover:bg-card-hover transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-accent text-[#111111] font-mono font-bold text-xs hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer shadow-lg shadow-accent/20"
                >
                  {editLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving Changes...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>Save Changes</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ================= REJECT REASON MODAL (Viewport Constrained: Centered, Zero Outer-Scroll) ================= */}
      {rejectModalBatch && createPortal(
        <div className="fixed inset-0 z-[99999] bg-panel/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-hidden animate-fadeIn">
          <div className="w-full max-w-md max-h-[90vh] bg-card/95 backdrop-blur-2xl border border-border/80 rounded-2xl shadow-2xl relative flex flex-col overflow-hidden">
            <div className="p-4 sm:p-5 space-y-3.5 overflow-y-auto">
              <div className="border-b border-border/60 pb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-rose-700 dark:text-rose-400 font-display font-bold uppercase text-base sm:text-lg min-w-0 truncate">
                  <XCircle className="w-5 h-5 shrink-0" />
                  <span className="truncate">Reject Certificate Batch</span>
                </div>
                <button
                  onClick={() => setRejectModalBatch(null)}
                  className="p-1.5 text-text-muted hover:text-text hover:bg-card-hover rounded-xl border border-border/60 transition-colors cursor-pointer shrink-0"
                  aria-label="Close modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-xs text-text-muted">
                Rejecting batch <span className="font-mono font-bold text-text">#{rejectModalBatch.batchId}</span> for{" "}
                <span className="font-bold text-text">{rejectModalBatch.eventName}</span> will suppress background queue processing and delete unverified certificates for this batch.
              </p>

              <form onSubmit={handleConfirmReject} className="space-y-3.5">
                <div>
                  <label className="text-xs font-mono font-bold text-text uppercase tracking-wider block mb-1">
                    Rejection Reason (Optional)
                  </label>
                  <textarea
                    rows={3}
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="e.g., Signature image resolution is too low, or event date is incorrect..."
                    className="w-full bg-card-hover/60 border border-border/80 rounded-xl p-2.5 text-xs font-mono text-text focus:outline-none focus:ring-1 focus:ring-accent transition-all resize-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
                  <button
                    type="button"
                    onClick={() => setRejectModalBatch(null)}
                    className="px-4 py-2 rounded-xl bg-card border border-border text-xs font-mono font-bold text-text hover:bg-card-hover transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoadingId === rejectModalBatch._id}
                    className="px-5 py-2 rounded-xl bg-rose-500 text-white font-mono font-bold text-xs hover:bg-rose-600 transition-all disabled:opacity-50 cursor-pointer shadow-lg shadow-rose-500/20"
                  >
                    {actionLoadingId === rejectModalBatch._id ? "Rejecting..." : "Confirm Reject"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
