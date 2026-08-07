import { useCallback, useEffect, useRef, useState } from "react";
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  TextField,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stack,
  Chip,
  Snackbar,
  Alert,
  CircularProgress,
} from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import VisibilityIcon from "@mui/icons-material/Visibility";
import axios from "axios";

const BASE_URL = import.meta.env.VITE_BASE_URL;

// "all" is a real value, not "" — MUI Select treats an empty string as
// "nothing selected" and leaves the closed field blank.
const MODE_ALL = "all";
const MODES = ["Counting", "Defect Detection", "Measurement"];

const HEADERS = [
  "Sr.No",
  "Part Code",
  "Part Name",
  "Category",
  "Mode",
  "Total Count",
  "Status",
  "Start Date",
  "Start Time",
  "Stop Date",
  "Stop Time",
];

// shared date-field styling — theme already paints the focus border red
const dateFieldSx = {
  "& .MuiOutlinedInput-root": { bgcolor: "background.paper", height: 48 },
};

// compact toolbar controls — 32px tall instead of MUI's 40px "small"
const compactSx = {
  "& .MuiOutlinedInput-root": { height: 32, fontSize: "0.8rem" },
  "& .MuiOutlinedInput-input": { py: 0, fontSize: "0.8rem" },
  "& .MuiSelect-select": { py: 0, display: "flex", alignItems: "center" },
};

const compactBtnSx = {
  height: 32,
  fontSize: "0.75rem",
  px: 1.5,
  textTransform: "none",
  "& .MuiButton-startIcon": { mr: 0.5 },
  "& .MuiButton-startIcon > *": { fontSize: 16 },
};

const scrollbarSx = {
  "&::-webkit-scrollbar": { width: 12, height: 12 },
  "&::-webkit-scrollbar-track": { bgcolor: "background.default", borderRadius: 1 },
  "&::-webkit-scrollbar-thumb": {
    bgcolor: "text.secondary",
    borderRadius: 1,
    border: "3px solid transparent",
    backgroundClip: "content-box",
  },
};

export default function Dashboard() {
  const [stats, setStats] = useState({});
  const [jobs, setJobs] = useState([]);

  // filters
  const [filter, setFilter] = useState("all"); // today | month | all | range
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [filterStart, setFilterStart] = useState("");
  const [filterEnd, setFilterEnd] = useState("");
  const [modeFilter, setModeFilter] = useState(MODE_ALL);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // download modal
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [downloadStart, setDownloadStart] = useState("");
  const [downloadEnd, setDownloadEnd] = useState("");
  const [downloadFormat, setDownloadFormat] = useState("csv");

  // pagination
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);

  // ui
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastSeverity, setToastSeverity] = useState("error");

  const notify = useCallback((message, severity = "error") => {
    setToastMessage(message);
    setToastSeverity(severity);
    setToastOpen(true);
  }, []);

  // debounce the part-code search box
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  // A custom range only becomes active once both dates are set, so everything
  // runs off one effect instead of two competing ones.
  const rangeReady = filter !== "range" || (filterStart && filterEnd);

  const buildParams = useCallback(
    (extra = {}) => {
      const params = new URLSearchParams();
      params.append("time_filter", filter);
      if (filter === "range") {
        params.append("start_date", filterStart);
        params.append("end_date", filterEnd);
      }
      Object.entries(extra).forEach(([k, v]) => {
        if (v !== "" && v !== null && v !== undefined) params.append(k, v);
      });
      return params;
    },
    [filter, filterStart, filterEnd],
  );

  const latestRequest = useRef(0);

  useEffect(() => {
    if (!rangeReady) {
      setJobs([]);
      setTotal(0);
      setStats({});
      return;
    }

    const requestId = ++latestRequest.current;
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      try {
        const [statsRes, jobsRes] = await Promise.all([
          axios.get(`${BASE_URL}/dashboard/stats?${buildParams().toString()}`),
          axios.get(
            `${BASE_URL}/dashboard/recent-jobs?${buildParams({
              page,
              limit,
              part_code: debouncedSearch,
              // sentinel never reaches the API — buildParams drops "" values
              mode: modeFilter === MODE_ALL ? "" : modeFilter,
            }).toString()}`,
          ),
        ]);

        if (cancelled || requestId !== latestRequest.current) return;

        setStats(statsRes.data || {});
        const payload = jobsRes.data || {};
        setJobs(payload.data || []);
        setTotal(payload.total || 0);
      } catch (err) {
        if (cancelled) return;
        console.error("Dashboard load failed:", err);
        setJobs([]);
        setTotal(0);
        notify("Could not load dashboard data. Check the API connection.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [
    filter,
    filterStart,
    filterEnd,
    page,
    limit,
    debouncedSearch,
    modeFilter,
    rangeReady,
    buildParams,
    notify,
  ]);

  // ===== format helpers =====
  const formatDate = (value) =>
    value ? new Date(value).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }) : "N/A";

  const formatTime = (value) =>
    value
      ? new Date(value).toLocaleTimeString("en-IN", {
          timeZone: "Asia/Kolkata",
          hour12: true,
        })
      : "N/A";

  const isFutureDate = (dateStr) => {
    const today = new Date().setHours(0, 0, 0, 0);
    return new Date(dateStr).setHours(0, 0, 0, 0) > today;
  };

  const validateRange = (start, end) => {
    if (!start || !end) {
      notify("Select both a start and an end date.", "warning");
      return false;
    }
    if (isFutureDate(start) || isFutureDate(end)) {
      notify("Future dates are not allowed.", "warning");
      return false;
    }
    if (new Date(start) > new Date(end)) {
      notify("Start date cannot be after end date.", "warning");
      return false;
    }
    return true;
  };

  // ===== download =====
  const closeDownloadModal = () => {
    setDownloadModalOpen(false);
    setDownloadStart("");
    setDownloadEnd("");
    setDownloadFormat("csv");
  };

  const handleDownload = async () => {
    if (!validateRange(downloadStart, downloadEnd)) return;

    setIsDownloading(true);
    try {
      const response = await fetch(
        `${BASE_URL}/dashboard/download-report?start_date=${downloadStart}&end_date=${downloadEnd}&format=${downloadFormat}`,
      );
      if (!response.ok) throw new Error(await response.text());

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      const timestamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
      a.href = url;
      a.download = `part_report_${downloadStart}_to_${downloadEnd}_${timestamp}.${downloadFormat}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      notify("Report downloaded.", "success");
      closeDownloadModal();
    } catch (error) {
      console.error("Download failed:", error);
      notify("Report download failed. Try a smaller date range.");
    } finally {
      setIsDownloading(false);
    }
  };

  // ===== filters =====
  const applyRangeFilter = () => {
    if (!validateRange(filterStart, filterEnd)) return;
    setFilter("range");
    setPage(1);
    setFilterModalOpen(false);
  };

  const handleFilterChange = (value) => {
    setFilter(value);
    setPage(1);
    if (value !== "range") {
      setFilterStart("");
      setFilterEnd("");
    } else {
      setFilterModalOpen(true);
    }
  };

  // ===== pagination =====
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const handlePrev = () => page > 1 && setPage((p) => p - 1);
  const handleNext = () => page < totalPages && setPage((p) => p + 1);

  const cards = [
    { label: "No. of Sessions", value: stats.total_sessions || 0 },
    { label: "Total Parts Configured", value: stats.total_parts_configured || 0 },
    { label: "Total Parts Counted", value: stats.total_counted_parts || 0 },
    // { label: "Total Batches", value: stats.total_batches || 0 },
  ];

  const renderStatus = (job) => {
    if (job.is_calibration) {
      const passed = job.calibration_passed;
      return (
        <Chip
          size="small"
          variant="outlined"
          color={passed === false ? "warning" : "info"}
          label={
            passed === null || passed === undefined
              ? "Calibration"
              : passed
                ? "Cal · Pass"
                : "Cal · Fail"
          }
        />
      );
    }
    if (!job.status) return <Chip size="small" variant="outlined" label="—" />;
    return (
      <Chip
        size="small"
        label={job.status}
        color={job.status === "OK" ? "success" : "error"}
      />
    );
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* ===== Summary ===== */}
      <Box sx={{ mb: 5 }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: 1.5,
          }}
        >
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700, color: "text.primary" }}>
              Dashboard
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Summary
            </Typography>
          </Box>

          <Stack direction="row" spacing={1} alignItems="center">
            <TextField
              select
              size="small"
              value={filter}
              onChange={(e) => handleFilterChange(e.target.value)}
              sx={{
                width: 118,
                bgcolor: "background.paper",
                borderRadius: 1,
                boxShadow: 1,
                "& .MuiOutlinedInput-root fieldset": { border: "none" },
                ...compactSx,
              }}
            >
              <MenuItem value="today">Today</MenuItem>
              <MenuItem value="month">This Month</MenuItem>
              <MenuItem value="all">All Time</MenuItem>
              <MenuItem value="range">Custom Range</MenuItem>
            </TextField>

            <Button
              variant="contained"
              color="secondary"
              size="small"
              startIcon={<VisibilityIcon />}
              onClick={() => setFilterModalOpen(true)}
              sx={{ minWidth: 88, ...compactBtnSx }}
            >
              Filter
            </Button>

            <Button
              variant="contained"
              color="primary"
              size="small"
              startIcon={<DownloadIcon />}
              onClick={() => setDownloadModalOpen(true)}
              sx={{ minWidth: 100, ...compactBtnSx }}
            >
              Download
            </Button>
          </Stack>
        </Box>

        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 2 }}>
          {cards.map((card) => (
            <Paper
              key={card.label}
              elevation={1}
              sx={{
                p: 2,
                textAlign: "center",
                borderTop: "3px solid transparent",
                transition: "all .18s ease",
                "&:hover": {
                  bgcolor: "peach.main",
                  borderTopColor: "primary.main",
                  boxShadow: 3,
                },
              }}
            >
              <Typography variant="subtitle2" sx={{ color: "text.secondary" }}>
                {card.label}
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700, color: "text.primary" }}>
                {card.value}
              </Typography>
            </Paper>
          ))}
        </Box>

        {/* quality strip — reads straight off company_sessions.overall_status */}
        <Stack direction="row" spacing={1} sx={{ mt: 2 }} alignItems="center" flexWrap="wrap">
          {/* <Chip size="small" color="success" label={`OK ${stats.ok_sessions || 0}`} />
          <Chip size="small" color="error" label={`NOK ${stats.nok_sessions || 0}`} />
          <Chip
            size="small"
            variant="outlined"
            label={`Calibration runs ${stats.calibration_sessions || 0}`}
          /> */}
          {stats.avg_parts_per_minute ? (
            <Chip
              size="small"
              variant="outlined"
              label={`Avg ${stats.avg_parts_per_minute} parts/min`}
            />
          ) : null}
        </Stack>
      </Box>

      {/* ===== Sessions ===== */}
      <Box>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: 2,
            gap: 2,
            flexWrap: "wrap",
          }}
        >
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Typography variant="h6" sx={{ fontWeight: 600, color: "text.primary" }}>
              Sessions
            </Typography>
            <TextField
              size="small"
              placeholder="Search part code"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ width: 160, bgcolor: "background.paper", ...compactSx }}
            />
            <TextField
              select
              size="small"
              value={modeFilter}
              onChange={(e) => {
                setModeFilter(e.target.value);
                setPage(1);
              }}
              SelectProps={{
                displayEmpty: true,
                // draw the closed field's text from the value directly, so it
                // never blanks out regardless of what MUI matches internally
                renderValue: (v) => (!v || v === MODE_ALL ? "All modes" : v),
              }}
              sx={{ width: 142, bgcolor: "background.paper", ...compactSx }}
            >
              <MenuItem value={MODE_ALL}>All modes</MenuItem>
              {MODES.map((m) => (
                <MenuItem key={m} value={m}>
                  {m}
                </MenuItem>
              ))}
            </TextField>
          </Stack>

          <Stack direction="row" spacing={1.25} alignItems="center">
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              {`Total: ${total}`}
            </Typography>

            {/* plain TextField instead of FormControl + InputLabel — a floating
                label overlaps the border at 32px height */}
            <TextField
              select
              size="small"
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
              SelectProps={{ renderValue: (v) => `${v} rows` }}
              sx={{ width: 92, bgcolor: "background.paper", ...compactSx }}
            >
              <MenuItem value={10}>10</MenuItem>
              <MenuItem value={20}>20</MenuItem>
              <MenuItem value={50}>50</MenuItem>
            </TextField>

            <Button
              variant="outlined"
              color="primary"
              size="small"
              onClick={handlePrev}
              disabled={page <= 1}
              sx={{ minWidth: 60, ...compactBtnSx }}
            >
              Prev
            </Button>
            <Typography
              variant="caption"
              sx={{ color: "text.secondary", whiteSpace: "nowrap" }}
            >
              {`Page ${page} / ${totalPages}`}
            </Typography>
            <Button
              variant="outlined"
              color="primary"
              size="small"
              onClick={handleNext}
              disabled={page >= totalPages}
              sx={{ minWidth: 60, ...compactBtnSx }}
            >
              Next
            </Button>
          </Stack>
        </Box>

        <TableContainer
          component={Paper}
          elevation={2}
          sx={{ height: "calc(100vh - 380px)", overflowY: "auto", ...scrollbarSx }}
        >
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                {HEADERS.map((header) => (
                  <TableCell
                    key={header}
                    sx={{
                      fontWeight: 700,
                      color: "text.primary",
                      bgcolor: "background.default",
                      py: 1.5,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {header}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>

            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={HEADERS.length} align="center" sx={{ py: 6 }}>
                    <CircularProgress size={28} color="primary" />
                  </TableCell>
                </TableRow>
              ) : jobs.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={HEADERS.length}
                    align="center"
                    sx={{ py: 6, color: "text.secondary" }}
                  >
                    {filter === "range" && !rangeReady
                      ? "Pick a start and end date to see sessions."
                      : "No sessions in this range."}
                  </TableCell>
                </TableRow>
              ) : (
                jobs.map((job, idx) => (
                  <TableRow
                    key={job.session_id || idx}
                    hover
                    sx={{ "&:hover": { bgcolor: "accent.light" } }}
                  >
                    <TableCell>{(page - 1) * limit + idx + 1}</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{job.part_code || "N/A"}</TableCell>
                    <TableCell>{job.part_name || "N/A"}</TableCell>
                    <TableCell>{job.category || "N/A"}</TableCell>
                    <TableCell>{job.mode || "N/A"}</TableCell>
                    {/* <TableCell>{job.batch_count ?? 0}</TableCell> */}
                    <TableCell>{job.total_count ?? 0}</TableCell>
                    <TableCell>{renderStatus(job)}</TableCell>
                    <TableCell>{formatDate(job.start_time)}</TableCell>
                    <TableCell>{formatTime(job.start_time)}</TableCell>
                    <TableCell>{formatDate(job.stop_time)}</TableCell>
                    <TableCell>{formatTime(job.stop_time)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      {/* ===== Filter modal ===== */}
      <Dialog
        open={filterModalOpen}
        onClose={() => setFilterModalOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2, width: 480 } }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Filter Sessions</DialogTitle>

        <DialogContent
          sx={{
            bgcolor: "background.default",
            mt: 1,
            p: 3,
            display: "flex",
            flexDirection: "column",
            gap: 3,
          }}
        >
          {[
            { label: "From", value: filterStart, set: setFilterStart },
            { label: "To", value: filterEnd, set: setFilterEnd },
          ].map((field) => (
            <Box key={field.label}>
              <Typography
                sx={{ fontSize: "0.875rem", fontWeight: 600, color: "text.primary", mb: 0.5 }}
              >
                {field.label}
              </Typography>
              <TextField
                type="date"
                fullWidth
                InputLabelProps={{ shrink: true }}
                value={field.value}
                onChange={(e) => field.set(e.target.value)}
                sx={dateFieldSx}
              />
            </Box>
          ))}
        </DialogContent>

        <DialogActions sx={{ p: 3, pt: 2, gap: 2 }}>
          <Button
            variant="outlined"
            color="secondary"
            onClick={() => setFilterModalOpen(false)}
            sx={{ flex: 1 }}
          >
            Cancel
          </Button>
          <Button variant="contained" color="primary" onClick={applyRangeFilter} sx={{ flex: 1 }}>
            Apply Filter
          </Button>
        </DialogActions>
      </Dialog>

      {/* ===== Download modal ===== */}
      <Dialog
        open={downloadModalOpen}
        onClose={closeDownloadModal}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2, width: 480 } }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>
          Download Report
          <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5, fontWeight: 400 }}>
            Select a date range and a format
          </Typography>
        </DialogTitle>

        <DialogContent
          sx={{
            bgcolor: "background.default",
            mt: 1,
            p: 3,
            display: "flex",
            flexDirection: "column",
            gap: 3,
          }}
        >
          {[
            { label: "From", value: downloadStart, set: setDownloadStart },
            { label: "To", value: downloadEnd, set: setDownloadEnd },
          ].map((field) => (
            <Box key={field.label}>
              <Typography
                sx={{ fontSize: "0.875rem", fontWeight: 600, color: "text.primary", mb: 0.5 }}
              >
                {field.label}
              </Typography>
              <TextField
                type="date"
                fullWidth
                InputLabelProps={{ shrink: true }}
                value={field.value}
                onChange={(e) => field.set(e.target.value)}
                sx={dateFieldSx}
              />
            </Box>
          ))}

          <Box>
            <Typography
              sx={{ fontSize: "0.875rem", fontWeight: 600, color: "text.primary", mb: 0.5 }}
            >
              Choose Format
            </Typography>
            <TextField
              select
              fullWidth
              value={downloadFormat}
              onChange={(e) => setDownloadFormat(e.target.value)}
              sx={dateFieldSx}
            >
              <MenuItem value="pdf">PDF</MenuItem>
              <MenuItem value="csv">CSV</MenuItem>
            </TextField>
          </Box>
        </DialogContent>

        <DialogActions sx={{ p: 3, pt: 2, gap: 2 }}>
          <Button
            variant="outlined"
            color="secondary"
            onClick={closeDownloadModal}
            sx={{ flex: 1 }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleDownload}
            disabled={isDownloading}
            sx={{ flex: 1 }}
          >
            {isDownloading ? "Downloading…" : "Download"}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={toastOpen}
        autoHideDuration={3000}
        onClose={() => setToastOpen(false)}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert
          severity={toastSeverity}
          sx={{ width: "100%" }}
          onClose={() => setToastOpen(false)}
        >
          {toastMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
}