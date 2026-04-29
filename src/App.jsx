import { useEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
// ============================================================================
// 🛑 BLOQUE 1: CONSTANTES GLOBALES Y CONFIGURACIÓN
// ============================================================================

const CAMPOS_VACIOS = { kcal: "", prot: "", carb: "", gras: "", fibr: "", agua: "" };
const REGISTRO_CERO = { kcal: 0, prot: 0, carb: 0, gras: 0, fibr: 0, agua: 0 };
const METAS_DIARIAS = { kcal: 1800, prot: 110, carb: 200, gras: 60, fibr: 45, agua: 2500 };
const COMIDAS_PRINCIPALES = ["Desayuno", "Almuerzo", "Cena"];

const OPCIONES = [
  { label: "Desayuno", icono: "🍳" },
  { label: "Colación AM", icono: "🍎" },
  { label: "Almuerzo", icono: "🍱" },
  { label: "Colación PM", icono: "🥪" },
  { label: "Cena", icono: "🍽️" },
];

const OPCION_AGUA = { label: "Solo Agua", icono: "💧" };

const COLORES = {
  kcal: "#ff7a70",
  prot: "#ff5fa8",
  carb: "#f4a340",
  gras: "#36df68",
  fibr: "#c16dff",
  agua: "#67d8ff"
};

const COLOR_PROGRESO_INACTIVO = "#b7bcc8";

// 🌈 GRADIENTE DINÁMICO (RECUPERA FOTO 1)
const GRADIENTE_PROGRESO =
  "linear-gradient(90deg, #ff2148 0%, #ff5b2f 18%, #ff9f43 42%, #ffd34d 68%, #b8e558 84%, #58b850 100%)";

// 🎨 TRANSICIÓN SUAVE POR PORCENTAJE
const PROGRESS_STOPS = [
  { pct: 0, color: [255, 78, 78] },     // rojo fuerte
  { pct: 35, color: [255, 150, 66] },   // naranja
  { pct: 65, color: [255, 211, 77] },   // amarillo
  { pct: 85, color: [184, 229, 88] },   // verde claro
  { pct: 100, color: [88, 184, 80] },   // verde fuerte
];

// ============================================================================
// ⚙️ BLOQUE 2: FUNCIONES MATEMÁTICAS Y FECHAS
// ============================================================================

function toNumber(value) {
  if (value === "" || value === null || value === undefined) return 0;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}
function fromSaved(value) { return value ? String(value) : ""; }
function clampMinZero(value) { return Math.max(0, value); }
function sumCampos(a, b) {
  return {
    kcal: (a?.kcal || 0) + (b?.kcal || 0), prot: (a?.prot || 0) + (b?.prot || 0),
    carb: (a?.carb || 0) + (b?.carb || 0), gras: (a?.gras || 0) + (b?.gras || 0),
    fibr: (a?.fibr || 0) + (b?.fibr || 0), agua: (a?.agua || 0) + (b?.agua || 0),
  };
}
function getNextMainMeal(registrosPrincipales) { return COMIDAS_PRINCIPALES.find((meal) => !registrosPrincipales[meal]) || null; }
function getPendingMainMealsCount(registrosPrincipales) {
  const count = COMIDAS_PRINCIPALES.filter((meal) => !registrosPrincipales[meal]).length;
  return count > 0 ? count : 1;
}
function getRegistroResumen(registro) {
  if (!registro) return "";
  const partes = [];
  if ((registro.kcal || 0) > 0) partes.push(`${Math.round(registro.kcal)} kcal`);
  if ((registro.prot || 0) > 0) partes.push(`${Math.round(registro.prot)}g prot`);
  if ((registro.agua || 0) > 0) partes.push(`${Math.round(registro.agua)} ml`);
  if (partes.length === 0) return "Sin datos";
  return partes.slice(0, 3).join(" · ");
}
function buildRegistrosIngresados(registrosPrincipales, registrosColaciones, aguaExtra) {
  const orden = ["Desayuno", "Colación AM", "Almuerzo", "Colación PM", "Cena", "Solo Agua"];
  const items = [];
  orden.forEach((label) => {
    if (label === "Solo Agua") {
      const aguaTotal = aguaExtra.reduce((sum, item) => sum + (item.agua || 0), 0);
      if (aguaTotal > 0) {
        items.push({ key: "Solo Agua", label: "Solo Agua", icono: "💧", tipo: "agua", resumen: `${Math.round(aguaTotal)} ml`, registro: { ...CAMPOS_VACIOS, agua: aguaTotal } });
      }
      return;
    }
    const registro = registrosPrincipales[label] || registrosColaciones[label];
    if (registro) {
      const icono = OPCIONES.find((op) => op.label === label)?.icono || "🍽️";
      const tipo = COMIDAS_PRINCIPALES.includes(label) ? "principal" : "colacion";
      items.push({ key: label, label, icono, tipo, resumen: getRegistroResumen(registro), registro });
    }
  });
  return items;
}
function buildPendientesDia(registrosPrincipales, registrosColaciones) {
  const pendientes = [];
  if (!registrosPrincipales.Desayuno) pendientes.push("Desayuno");
  if (registrosPrincipales.Desayuno && !registrosColaciones["Colación AM"]) pendientes.push("Colación AM");
  if (!registrosPrincipales.Almuerzo) pendientes.push("Almuerzo");
  if (registrosPrincipales.Almuerzo && !registrosColaciones["Colación PM"]) pendientes.push("Colación PM");
  if (!registrosPrincipales.Cena) pendientes.push("Cena");
  return pendientes;
}
function getNextRegistroPendiente(registrosPrincipales, registrosColaciones) {
  if (!registrosPrincipales.Desayuno) return "Desayuno";
  if (registrosPrincipales.Desayuno && !registrosColaciones["Colación AM"]) return "Colación AM";
  if (!registrosPrincipales.Almuerzo) return "Almuerzo";
  if (registrosPrincipales.Almuerzo && !registrosColaciones["Colación PM"]) return "Colación PM";
  if (!registrosPrincipales.Cena) return "Cena";
  return "Solo Agua";
}
function mixColor(a, b, t) {
  const mix = a.map((val, idx) => Math.round(val + (b[idx] - val) * t));
  return `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`;
}
function getProgressAccentColor(pct) {
  const clamped = Math.max(0, Math.min(pct, 100));
  for (let i = 0; i < PROGRESS_STOPS.length - 1; i += 1) {
    const start = PROGRESS_STOPS[i];
    const end = PROGRESS_STOPS[i + 1];
    if (clamped >= start.pct && clamped <= end.pct) {
      const range = end.pct - start.pct || 1;
      const t = (clamped - start.pct) / range;
      return mixColor(start.color, end.color, t);
    }
  }
  const last = PROGRESS_STOPS[PROGRESS_STOPS.length - 1].color;
  return `rgb(${last[0]}, ${last[1]}, ${last[2]})`;
}
function formatRangoHistorialTexto(dateInput) {
  const base = dateInput instanceof Date ? new Date(dateInput) : new Date(dateInput);
  const day = base.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(base);
  monday.setDate(base.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const dias = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const meses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  return `${dias[monday.getDay()]} ${monday.getDate()} de ${meses[monday.getMonth()]} a ${dias[sunday.getDay()]} ${sunday.getDate()} de ${meses[sunday.getMonth()]}`;
}
function formatMesHistorialTexto(dateInput) {
  const base = dateInput instanceof Date ? new Date(dateInput) : new Date(dateInput);
  return base.toLocaleDateString("es-ES", { month: "long", year: "numeric" }).toUpperCase();
}
function getTituloPantalla(vistaActual, historialVista) {
  if (vistaActual === "pdf") {
    if (historialVista === "diario") return "Resumen Diario";
    if (historialVista === "semanal") return "Resumen Semanal";
    if (historialVista === "mensual") return "Resumen Mensual";
    return "Resúmenes";
  }
  return "Registro Diario";
}
function formatMetaHistorialValue(value, unidad) { return `${Math.round(value || 0)}${unidad}`; }

function formatFechaCompletaPdf(dateInput) {
  const base = dateInput instanceof Date ? new Date(dateInput) : new Date(dateInput);
  return base.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
function getPeriodoPdfLabel(titulo, fechaBaseHoy) {
  if (titulo === "Resumen Diario") return formatFechaCompletaPdf(fechaBaseHoy);
  if (titulo === "Resumen Semanal") return formatRangoHistorialTexto(fechaBaseHoy);
  if (titulo === "Resumen Mensual") return formatMesHistorialTexto(fechaBaseHoy);
  return formatFechaCompletaPdf(fechaBaseHoy);
}
function buildPdfFileName(titulo, fechaBaseHoy) {
  const base = String(titulo || "reporte").toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");
  const fecha = formatDateKey(fechaBaseHoy || new Date());
  return `${base || "reporte"}-${fecha}.pdf`;
}
function getPdfMetricColors(key) {
  const colors = {
    kcal: ["#ff3b30", "#ffa515"],
    prot: ["#ff2f4f", "#ff6a7a"],
    carb: ["#ff9d00", "#ffd43b"],
    gras: ["#0f9f5f", "#85d63a"],
    fibr: ["#159447", "#7bd12e"],
    agua: ["#0d6efd", "#45c4f2"],
  };
  return colors[key] || ["#ff6a00", "#ffa515"];
}

// ============================================================================
// 💾 BLOQUE 3: ALMACENAMIENTO Y MANEJO DE DATOS LOCALES
// ============================================================================

const STORAGE_CURRENT_DAY_KEY = "nutri_app_current_day_v2";
const STORAGE_HISTORY_KEY = "nutri_app_history_v2";
const STORAGE_PROFILE_KEY = "nutri_app_profile_v1";
const STORAGE_PENDING_DAY_KEY = "nutri_app_pending_day_v1";

function getDefaultProfileState() {
  return { nombre: "", metasBase: { kcal: 0, prot: 0, carb: 0, gras: 0, fibr: 0, agua: 0 }, setupCompleto: false };
}
function sanitizeProfileState(value) {
  const nombre = String(value?.nombre || "").trim();
  const metasBase = {
    kcal: toNumber(value?.metasBase?.kcal), prot: toNumber(value?.metasBase?.prot),
    carb: toNumber(value?.metasBase?.carb), gras: toNumber(value?.metasBase?.gras),
    fibr: toNumber(value?.metasBase?.fibr), agua: toNumber(value?.metasBase?.agua),
  };
  const metasValidas = Object.values(metasBase).every((n) => n > 0);
  return { nombre, metasBase, setupCompleto: Boolean(value?.setupCompleto && nombre && metasValidas) };
}
function getInitialProfileState() {
  const base = getDefaultProfileState();
  if (typeof window === "undefined") return base;
  return sanitizeProfileState(safeJsonParse(window.localStorage.getItem(STORAGE_PROFILE_KEY), base));
}
function getStoredUserName() {
  if (typeof window === "undefined") return "Enrique";
  const candidateKeys = [STORAGE_PROFILE_KEY, "nutri_app_profile", "nutri_profile", "userProfile", "profile", "nombreUsuario", "user_name", "nombre"];
  for (const key of candidateKeys) {
    const raw = window.localStorage.getItem(key);
    if (!raw) continue;
    if (key === "nombreUsuario" || key === "user_name" || key === "nombre") {
      const value = String(raw).trim();
      if (value) return value;
    }
    try {
      const parsed = JSON.parse(raw);
      const value = String(parsed?.nombre || parsed?.name || parsed?.userName || parsed?.username || "").trim();
      if (value) return value;
    } catch {
      const value = String(raw).trim();
      if (value && !value.startsWith("{")) return value;
    }
  }
  return "Enrique";
}
function safeJsonParse(value, fallback) { try { return value ? JSON.parse(value) : fallback; } catch { return fallback; } }
function dayStateHasEntries(dayState) {
  if (!dayState) return false;
  return Object.values(dayState.registrosPrincipales || {}).some(Boolean) ||
         Object.values(dayState.registrosColaciones || {}).some(Boolean) ||
         (Array.isArray(dayState.aguaExtra) && dayState.aguaExtra.length > 0);
}
function persistPendingDayState(dayState) {
  if (typeof window === "undefined") return;
  if (!dayState || !dayStateHasEntries(dayState) || dayState.diaFinalizado) {
    window.localStorage.removeItem(STORAGE_PENDING_DAY_KEY);
    return;
  }
  window.localStorage.setItem(STORAGE_PENDING_DAY_KEY, JSON.stringify(dayState));
}
function clearPendingDayState() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_PENDING_DAY_KEY);
}
function formatDateKey(dateInput) {
  const date = dateInput instanceof Date ? new Date(dateInput) : new Date(dateInput);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function parseDateFromKey(dateKey) {
  const [year, month, day] = String(dateKey).split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}
function getStartOfDay(dateInput) {
  const date = dateInput instanceof Date ? new Date(dateInput) : new Date(dateInput);
  date.setHours(0, 0, 0, 0);
  return date;
}
function getEndOfDay(dateInput) {
  const date = dateInput instanceof Date ? new Date(dateInput) : new Date(dateInput);
  date.setHours(23, 59, 59, 999); return date;
}
function getStartOfWeek(dateInput) {
  const base = dateInput instanceof Date ? new Date(dateInput) : new Date(dateInput);
  const day = base.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = getStartOfDay(base);
  monday.setDate(base.getDate() + diffToMonday);
  return monday;
}
function cloneMetas(metas = METAS_DIARIAS) {
  return {
    kcal: toNumber(metas.kcal), prot: toNumber(metas.prot), carb: toNumber(metas.carb),
    gras: toNumber(metas.gras), fibr: toNumber(metas.fibr), agua: toNumber(metas.agua),
  };
}
function sanitizeCampos(value, fallback = REGISTRO_CERO) {
  return {
    kcal: toNumber(value?.kcal ?? fallback.kcal ?? 0), prot: toNumber(value?.prot ?? fallback.prot ?? 0),
    carb: toNumber(value?.carb ?? fallback.carb ?? 0), gras: toNumber(value?.gras ?? fallback.gras ?? 0),
    fibr: toNumber(value?.fibr ?? fallback.fibr ?? 0), agua: toNumber(value?.agua ?? fallback.agua ?? 0),
  };
}
function sanitizeMetas(value, fallback = METAS_DIARIAS) { return sanitizeCampos(value, fallback); }
function roundCampos(value) {
  return {
    kcal: Math.round(toNumber(value?.kcal)), prot: Math.round(toNumber(value?.prot)),
    carb: Math.round(toNumber(value?.carb)), gras: Math.round(toNumber(value?.gras)),
    fibr: Math.round(toNumber(value?.fibr)), agua: Math.round(toNumber(value?.agua)),
  };
}
function buildStoredRegistro(registro, segmentId) {
  return { ...sanitizeCampos(registro, REGISTRO_CERO), _timestamp: new Date().toISOString(), _segmentId: segmentId || null };
}
function sanitizeSavedRegistro(registro) {
  if (!registro) return null;
  return { ...registro, ...sanitizeCampos(registro, REGISTRO_CERO), _timestamp: registro._timestamp || new Date().toISOString(), _segmentId: registro._segmentId || null, _resueltaEnCero: Boolean(registro._resueltaEnCero) };
}
function sanitizeSavedAguaExtra(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item, index) => ({ id: item?.id || `agua-${Date.now()}-${index}`, agua: toNumber(item?.agua), _timestamp: item?._timestamp || new Date().toISOString(), _segmentId: item?._segmentId || null })).filter((item) => item.agua > 0);
}
function createMetaSegment(startAt, metas, segmentId) {
  return { id: segmentId || `meta-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, startAt, endAt: null, metas: cloneMetas(metas) };
}
function sanitizeSavedSegments(segments, fechaISO, fallbackMetas) {
  const dayStartIso = getStartOfDay(fechaISO).toISOString();
  if (!Array.isArray(segments) || segments.length === 0) return [createMetaSegment(dayStartIso, fallbackMetas)];
  const cleaned = segments.map((segment, index) => ({
    id: segment?.id || `meta-${Date.now()}-${index}`, startAt: segment?.startAt || (index === 0 ? dayStartIso : new Date().toISOString()),
    endAt: segment?.endAt || null, metas: sanitizeMetas(segment?.metas, fallbackMetas),
  })).sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  cleaned[0].startAt = dayStartIso;
  return cleaned;
}
function getDefaultDayState(dateInput = new Date(), metasBase = METAS_DIARIAS) {
  const start = getStartOfDay(dateInput);
  const fechaKey = formatDateKey(start);
  const metasIniciales = cloneMetas(Object.values(metasBase || {}).every((n) => toNumber(n) > 0) ? metasBase : METAS_DIARIAS);
  return {
    fechaKey, fechaISO: start.toISOString(),
    registrosPrincipales: { Desayuno: null, Almuerzo: null, Cena: null },
    registrosColaciones: { "Colación AM": null, "Colación PM": null },
    aguaExtra: [], diaFinalizado: false, metasActuales: metasIniciales,
    segmentosMetas: [createMetaSegment(start.toISOString(), metasIniciales)],
  };
}

// 🛡️ SISTEMA DE RESCATE
function getInitialCurrentDayState(metasBase = METAS_DIARIAS) {
  const hoyStart = getStartOfDay(new Date());
  const hoyKey = formatDateKey(hoyStart);
  const baseHoy = getDefaultDayState(new Date(), metasBase);

  if (typeof window === "undefined") return baseHoy;

  const rawPending = safeJsonParse(window.localStorage.getItem(STORAGE_PENDING_DAY_KEY), null);
  if (rawPending?.fechaKey) {
    const pendingBase = getDefaultDayState(parseDateFromKey(rawPending.fechaKey), metasBase);
    const pendingSanitized = sanitizeCurrentDayState(rawPending, pendingBase);
    if (pendingSanitized.fechaKey !== hoyKey && !pendingSanitized.diaFinalizado && dayStateHasEntries(pendingSanitized)) {
      return pendingSanitized;
    }
    clearPendingDayState();
  }

  const raw = safeJsonParse(window.localStorage.getItem(STORAGE_CURRENT_DAY_KEY), null);
  if (!raw) return baseHoy;

  const fallbackBase = raw?.fechaKey ? getDefaultDayState(parseDateFromKey(raw.fechaKey), metasBase) : baseHoy;
  const sanitized = sanitizeCurrentDayState(raw, fallbackBase);

  if (sanitized.fechaKey !== hoyKey) {
    if (!sanitized.diaFinalizado && dayStateHasEntries(sanitized)) {
      persistPendingDayState(sanitized);
      return sanitized;
    }
    return baseHoy;
  }

  return sanitized;
}

function sanitizeCurrentDayState(raw, base = getDefaultDayState()) {
  const metasActuales = sanitizeMetas(raw?.metasActuales, METAS_DIARIAS);
  return {
    fechaKey: raw?.fechaKey || base.fechaKey, fechaISO: raw?.fechaISO || base.fechaISO,
    registrosPrincipales: { Desayuno: sanitizeSavedRegistro(raw?.registrosPrincipales?.Desayuno), Almuerzo: sanitizeSavedRegistro(raw?.registrosPrincipales?.Almuerzo), Cena: sanitizeSavedRegistro(raw?.registrosPrincipales?.Cena) },
    registrosColaciones: { "Colación AM": sanitizeSavedRegistro(raw?.registrosColaciones?.["Colación AM"]), "Colación PM": sanitizeSavedRegistro(raw?.registrosColaciones?.["Colación PM"]) },
    aguaExtra: sanitizeSavedAguaExtra(raw?.aguaExtra), diaFinalizado: Boolean(raw?.diaFinalizado), metasActuales,
    segmentosMetas: sanitizeSavedSegments(raw?.segmentosMetas, raw?.fechaISO || base.fechaISO, metasActuales),
  };
}

function sanitizeHistorySnapshot(item) {
  if (!item) return null;
  const fechaKey = item.fechaKey || formatDateKey(item.fechaISO || new Date());
  return {
    id: item.id || fechaKey, fechaKey, fechaISO: item.fechaISO || getStartOfDay(parseDateFromKey(fechaKey)).toISOString(),
    totales: roundCampos(item.totales || REGISTRO_CERO), metaEfectiva: roundCampos(item.metaEfectiva || METAS_DIARIAS),
    hayCambioMetas: Boolean(item.hayCambioMetas), diaFinalizado: Boolean(item.diaFinalizado), finalizadoAt: item.finalizadoAt || null,
    registrosPrincipales: { Desayuno: sanitizeSavedRegistro(item.registrosPrincipales?.Desayuno), Almuerzo: sanitizeSavedRegistro(item.registrosPrincipales?.Almuerzo), Cena: sanitizeSavedRegistro(item.registrosPrincipales?.Cena) },
    registrosColaciones: { "Colación AM": sanitizeSavedRegistro(item.registrosColaciones?.["Colación AM"]), "Colación PM": sanitizeSavedRegistro(item.registrosColaciones?.["Colación PM"]) },
    aguaExtra: sanitizeSavedAguaExtra(item.aguaExtra), metasActuales: sanitizeMetas(item.metasActuales || METAS_DIARIAS),
    segmentosMetas: sanitizeSavedSegments(item.segmentosMetas, item.fechaISO || getStartOfDay(parseDateFromKey(fechaKey)).toISOString(), item.metasActuales || METAS_DIARIAS),
  };
}
function getInitialHistoryState() {
  if (typeof window === "undefined") return [];
  const raw = safeJsonParse(window.localStorage.getItem(STORAGE_HISTORY_KEY), []);
  if (!Array.isArray(raw)) return [];
  return raw.map(sanitizeHistorySnapshot).filter(Boolean);
}
function getSegmentoMetaActivo(segmentosMetas) {
  if (!Array.isArray(segmentosMetas) || segmentosMetas.length === 0) return null;
  return segmentosMetas[segmentosMetas.length - 1];
}
function calcularMetaEfectivaDia({ segmentosMetas, metasActuales, fechaISO }) {
  const dayStart = getStartOfDay(fechaISO);
  const dayEnd = getEndOfDay(fechaISO);
  const totalMs = Math.max(1, dayEnd.getTime() - dayStart.getTime());
  const baseMetas = cloneMetas(metasActuales);
  const segments = sanitizeSavedSegments(segmentosMetas, fechaISO, baseMetas);
  const acumulado = { kcal: 0, prot: 0, carb: 0, gras: 0, fibr: 0, agua: 0 };
  let totalRatio = 0;
  segments.forEach((segment, index) => {
    const segmentStart = new Date(Math.max(new Date(segment.startAt).getTime(), dayStart.getTime()));
    const nextStart = segments[index + 1] ? new Date(segments[index + 1].startAt) : null;
    const explicitEnd = segment.endAt ? new Date(segment.endAt) : null;
    const candidateEnd = explicitEnd && !Number.isNaN(explicitEnd.getTime()) ? explicitEnd : nextStart || dayEnd;
    const segmentEnd = new Date(Math.min(candidateEnd.getTime(), dayEnd.getTime()));
    const duration = Math.max(0, segmentEnd.getTime() - segmentStart.getTime());
    const ratio = duration / totalMs;
    totalRatio += ratio;
    Object.keys(acumulado).forEach((key) => { acumulado[key] += toNumber(segment.metas?.[key]) * ratio; });
  });
  if (totalRatio < 1) {
    Object.keys(acumulado).forEach((key) => { acumulado[key] += toNumber(baseMetas[key]) * (1 - totalRatio); });
  }
  return roundCampos(acumulado);
}
function buildDaySnapshot({ fechaKey, fechaISO, registrosPrincipales, registrosColaciones, aguaExtra, diaFinalizado, metasActuales, segmentosMetas, totalesDia, metaEfectiva }) {
  return sanitizeHistorySnapshot({
    id: fechaKey, fechaKey, fechaISO, totales: roundCampos(totalesDia), metaEfectiva: roundCampos(metaEfectiva),
    hayCambioMetas: (segmentosMetas?.length || 0) > 1, diaFinalizado, finalizadoAt: diaFinalizado ? new Date().toISOString() : null,
    registrosPrincipales, registrosColaciones, aguaExtra, metasActuales, segmentosMetas,
  });
}
function upsertHistorySnapshot(history, snapshot) {
  const sanitized = sanitizeHistorySnapshot(snapshot);
  const filtered = (history || []).filter((item) => item?.fechaKey !== sanitized.fechaKey);
  return [...filtered, sanitized].sort((a, b) => a.fechaKey.localeCompare(b.fechaKey));
}
function hasAnyIntake(totales) { return Object.values(sanitizeCampos(totales, REGISTRO_CERO)).some((value) => value > 0); }
function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function formatHistorialBlockRange(startKey, endKey) {
  const start = parseDateFromKey(startKey);
  const end = parseDateFromKey(endKey);
  const dias = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const meses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  if (startKey === endKey) { return `${dias[start.getDay()]} ${start.getDate()} de ${meses[start.getMonth()]}`; }
  return `${dias[start.getDay()]} ${start.getDate()} de ${meses[start.getMonth()]} a ${dias[end.getDay()]} ${end.getDate()} de ${meses[end.getMonth()]}`;
}
function metasIguales(a, b) {
  if (!a || !b) return false;
  return ["kcal", "prot", "carb", "gras", "fibr", "agua"].every((key) => toNumber(a[key]) === toNumber(b[key]));
}
function isSnapshotVisibleInHistory(snapshot) {
  if (!snapshot) return false;
  return snapshot.diaFinalizado || hasAnyIntake(snapshot.totales);
}
function getCombinedMetaSummary(snapshot) {
  const segments = Array.isArray(snapshot?.segmentosMetas) ? snapshot.segmentosMetas : [];
  if (segments.length < 2) return null;
  const beforeMetas = sanitizeMetas(segments[0]?.metas, METAS_DIARIAS);
  const afterMetas = sanitizeMetas(segments[segments.length - 1]?.metas, METAS_DIARIAS);
  return { beforeMetas, afterMetas };
}
function buildHistorialBlocks(snapshots) {
  const visibles = (snapshots || []).filter(isSnapshotVisibleInHistory).sort((a, b) => a.fechaKey.localeCompare(b.fechaKey));
  const blocks = [];
  let current = null;
  visibles.forEach((snapshot) => {
    const combined = Boolean(snapshot.hayCambioMetas);
    const metasBase = sanitizeMetas(snapshot.metasActuales || snapshot.metaEfectiva, METAS_DIARIAS);
    if (combined) {
      if (current) { blocks.push(current); current = null; }
      blocks.push({ id: `combined-${snapshot.fechaKey}`, type: "combined", title: formatHistorialBlockRange(snapshot.fechaKey, snapshot.fechaKey), badge: "⚠️ 🔀 Metas combinadas: antes y actuales", rows: [snapshot], metas: metasBase, combinedSummary: getCombinedMetaSummary(snapshot) });
      return;
    }
    if (!current) {
      current = { id: `block-${snapshot.fechaKey}`, type: blocks.length === 0 ? "active" : "new", title: snapshot.fechaKey, endKey: snapshot.fechaKey, rows: [snapshot], metas: metasBase };
      return;
    }
    const prevDate = parseDateFromKey(current.endKey);
    const thisDate = parseDateFromKey(snapshot.fechaKey);
    const diffDays = Math.round((getStartOfDay(thisDate).getTime() - getStartOfDay(prevDate).getTime()) / 86400000);
    const consecutive = diffDays === 1;
    if (consecutive && metasIguales(current.metas, metasBase)) { current.rows.push(snapshot); current.endKey = snapshot.fechaKey; return; }
    blocks.push({ ...current, title: formatHistorialBlockRange(current.title, current.endKey), badge: current.type === "active" ? "Metas activas" : "Nuevas metas" });
    current = { id: `block-${snapshot.fechaKey}`, type: "new", title: snapshot.fechaKey, endKey: snapshot.fechaKey, rows: [snapshot], metas: metasBase };
  });
  if (current) { blocks.push({ ...current, title: formatHistorialBlockRange(current.title, current.endKey), badge: current.type === "active" ? "Metas activas" : "Nuevas metas" }); }
  return blocks;
}
function getWeekSnapshotsForRange(historialConHoy, fechaBaseHoy) {
  const monday = getStartOfWeek(fechaBaseHoy);
  return Array.from({ length: 7 }, (_, index) => {
    const fechaDia = new Date(monday);
    fechaDia.setDate(monday.getDate() + index);
    const fechaKey = formatDateKey(fechaDia);
    return historialConHoy.find((item) => item.fechaKey === fechaKey) || sanitizeHistorySnapshot({ id: fechaKey, fechaKey, fechaISO: getStartOfDay(fechaDia).toISOString(), totales: REGISTRO_CERO, metaEfectiva: METAS_DIARIAS, hayCambioMetas: false, diaFinalizado: false, registrosPrincipales: {}, registrosColaciones: {}, aguaExtra: [], metasActuales: METAS_DIARIAS, segmentosMetas: [createMetaSegment(getStartOfDay(fechaDia).toISOString(), METAS_DIARIAS)] });
  });
}
function getMonthSnapshotsForRange(historialConHoy, fechaBaseHoy) {
  const year = fechaBaseHoy.getFullYear();
  const month = fechaBaseHoy.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, index) => {
    const fechaDia = new Date(year, month, index + 1);
    const fechaKey = formatDateKey(fechaDia);
    return historialConHoy.find((item) => item.fechaKey === fechaKey) || sanitizeHistorySnapshot({ id: fechaKey, fechaKey, fechaISO: getStartOfDay(fechaDia).toISOString(), totales: REGISTRO_CERO, metaEfectiva: METAS_DIARIAS, hayCambioMetas: false, diaFinalizado: false, registrosPrincipales: {}, registrosColaciones: {}, aguaExtra: [], metasActuales: METAS_DIARIAS, segmentosMetas: [createMetaSegment(getStartOfDay(fechaDia).toISOString(), METAS_DIARIAS)] });
  });
}
// ============================================================================
// 📱 BLOQUE 4: COMPONENTE PRINCIPAL (APP)
// ============================================================================

function App() {
  const initialProfileState = useMemo(() => getInitialProfileState(), []);
  const initialDayState = useMemo(() => getInitialCurrentDayState(initialProfileState.metasBase), [initialProfileState]);
  const initialHistoryState = useMemo(() => getInitialHistoryState(), []);

  const [perfilUsuario, setPerfilUsuario] = useState(initialProfileState);
  const [setupInicialCompleto, setSetupInicialCompleto] = useState(Boolean(initialProfileState.setupCompleto));
  const [mostrarIntroSetup, setMostrarIntroSetup] = useState(true);
  const [vistaActual, setVistaActual] = useState("sugerencia");
  const [menuDatosAbierto, setMenuDatosAbierto] = useState(false);
  
  const hoyAvisoKey = useMemo(() => formatDateKey(new Date()), []);
  const [modalRescateAbierto, setModalRescateAbierto] = useState(() => initialDayState.fechaKey !== hoyAvisoKey);
  const [modoRescatePendiente, setModoRescatePendiente] = useState(() => initialDayState.fechaKey !== hoyAvisoKey);
  const [fechaDiaActivo, setFechaDiaActivo] = useState({ key: initialDayState.fechaKey, iso: initialDayState.fechaISO });
  const fechaHoyKey = fechaDiaActivo.key;
  const fechaHoyISO = fechaDiaActivo.iso;

  const [comida, setComida] = useState("Desayuno");
  const [abierto, setAbierto] = useState(false); 
  const [campos, setCampos] = useState(CAMPOS_VACIOS);
  const [mensaje, setMensaje] = useState("");
  const [camposInicio, setCamposInicio] = useState(() => ({
    nombre: initialProfileState.nombre || "", kcal: "", prot: "", carb: "", gras: "", fibr: "", agua: "",
  }));
  const [registrosPrincipales, setRegistrosPrincipales] = useState(initialDayState.registrosPrincipales);
  const [registrosColaciones, setRegistrosColaciones] = useState(initialDayState.registrosColaciones);
  const [aguaExtra, setAguaExtra] = useState(initialDayState.aguaExtra);
  const [diaFinalizado, setDiaFinalizado] = useState(initialDayState.diaFinalizado);
  const [metasActuales, setMetasActuales] = useState(initialDayState.metasActuales);
  const [segmentosMetas, setSegmentosMetas] = useState(initialDayState.segmentosMetas);
  const [historialDias, setHistorialDias] = useState(initialHistoryState);

  const [editorRegistroAbierto, setEditorRegistroAbierto] = useState(false);
  const [registroActivo, setRegistroActivo] = useState(null);
  const [camposEdicion, setCamposEdicion] = useState(CAMPOS_VACIOS);
  
  const [modalConfirmacionIngesta, setModalConfirmacionIngesta] = useState(null); 
  const [confirmacionEdicion, setConfirmacionEdicion] = useState(null);
  const [promptColacionActiva, setPromptColacionActiva] = useState(null);
  const [alertaDesayunoSaltado, setAlertaDesayunoSaltado] = useState(false);
  const [modalRegistroAguaAbierto, setModalRegistroAguaAbierto] = useState(false);
  
  const [modalFinalizar, setModalFinalizar] = useState(null);
  const [modalMetasAbierto, setModalMetasAbierto] = useState(false);
  const [camposMetas, setCamposMetas] = useState(() => ({
    kcal: String(initialDayState.metasActuales.kcal), prot: String(initialDayState.metasActuales.prot),
    carb: String(initialDayState.metasActuales.carb), gras: String(initialDayState.metasActuales.gras),
    fibr: String(initialDayState.metasActuales.fibr), agua: String(initialDayState.metasActuales.agua),
  }));
  const [historialVista, setHistorialVista] = useState("menu");
  const [fechaReporteDiarioKey, setFechaReporteDiarioKey] = useState(() => initialDayState.fechaKey);
  const [selectorSemanaDiarioAbierto, setSelectorSemanaDiarioAbierto] = useState(false);
  const [fechaSelectorDiario, setFechaSelectorDiario] = useState(() => initialDayState.fechaKey);
  const [modoPostGuardado, setModoPostGuardado] = useState(false);
  const [modoLectura, setModoLectura] = useState(false);
  const [pdfPreview, setPdfPreview] = useState(null);
  const [mostrarControlCierre, setMostrarControlCierre] = useState(false);
  const [homeActualizadaActiva, setHomeActualizadaActiva] = useState(false);

  const selectorRef = useRef(null);
  const previewFrameRef = useRef(null);
  const backupFileInputRef = useRef(null);
  const menuDatosRef = useRef(null);
  const sugerenciaCaptureRef = useRef(null);
  const resumenDiarioStickyRef = useRef(null);
  const resumenDiarioRowsRef = useRef(null);
  const resumenDiarioRowsInnerRef = useRef(null);
  const resumenDiarioNotaRef = useRef(null);
  const [resumenDiarioScrollHeight, setResumenDiarioScrollHeight] = useState(220);
  const [resumenDiarioRowHeight, setResumenDiarioRowHeight] = useState(112);
  const [resumenDiarioNotaHeight, setResumenDiarioNotaHeight] = useState(72);
  const [resumenDiarioParkingHeight, setResumenDiarioParkingHeight] = useState(0);
  const fechaBaseHoy = useMemo(() => parseDateFromKey(fechaHoyKey), [fechaHoyKey]);
  const fechaBaseReporteDiario = useMemo(() => parseDateFromKey(fechaReporteDiarioKey), [fechaReporteDiarioKey]);
  const actual = useMemo(() => OPCIONES.find((o) => o.label === comida) || OPCIONES[0], [comida]);
  const opcionesDisponibles = useMemo(() => OPCIONES.filter((op) => {
    if (op.label === "Colación AM" || op.label === "Colación PM") return !registrosColaciones[op.label];
    if (COMIDAS_PRINCIPALES.includes(op.label)) return !registrosPrincipales[op.label];
    return true;
  }), [registrosPrincipales, registrosColaciones]);
  
  const esColacion = comida === "Colación AM" || comida === "Colación PM";
  const fecha = fechaBaseHoy.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const fechaBonita = fecha.charAt(0).toUpperCase() + fecha.slice(1);
  const nombreUsuario = (setupInicialCompleto ? String(perfilUsuario.nombre || "").trim() : "") || getStoredUserName();
  const ocultarTituloSuperiorPdf = vistaActual === "pdf" && historialVista === "preview" && (pdfPreview?.titulo === "Resumen Semanal" || pdfPreview?.titulo === "Resumen Mensual");
  const tituloPantalla = vistaActual === "pdf" && historialVista === "preview" && pdfPreview?.titulo ? pdfPreview.titulo.toUpperCase() : getTituloPantalla(vistaActual, historialVista);
  const saludoTexto = useMemo(() => {
    const hora = new Date().getHours();
    if (hora >= 5 && hora < 12) return { texto: "¡Buenos días", emoji: "☀️" };
    if (hora >= 12 && hora < 19) return { texto: "¡Buenas tardes", emoji: "🌅" };
    return { texto: "¡Buenas noches", emoji: "🌙" };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const hoyRealKey = formatDateKey(new Date());
      if (fechaHoyKey !== hoyRealKey) {
        if (diaFinalizado) {
          iniciarNuevoDiaDesdeReloj();
        } else if (!modalRescateAbierto && !modoRescatePendiente) {
          setModalRescateAbierto(true);
        }
      }
    }, 60000); 
    return () => clearInterval(interval);
  }, [fechaHoyKey, diaFinalizado, modalRescateAbierto, modoRescatePendiente, metasActuales]);

  function iniciarNuevoDiaDesdeReloj() {
    clearPendingDayState();
    const nuevoDia = getDefaultDayState(new Date(), metasActuales);
    setFechaDiaActivo({ key: nuevoDia.fechaKey, iso: nuevoDia.fechaISO });
    setRegistrosPrincipales(nuevoDia.registrosPrincipales);
    setRegistrosColaciones(nuevoDia.registrosColaciones);
    setAguaExtra(nuevoDia.aguaExtra);
    setDiaFinalizado(nuevoDia.diaFinalizado);
    setSegmentosMetas([createMetaSegment(nuevoDia.fechaISO, metasActuales)]);
    setModalRescateAbierto(false);
    setModoRescatePendiente(false);
    setVistaActual("sugerencia");
    setHomeActualizadaActiva(false);
  }

  useEffect(() => {
    function handleClickOutside(event) {
      if (selectorRef.current && !selectorRef.current.contains(event.target)) setAbierto(false);
      if (menuDatosRef.current && !menuDatosRef.current.contains(event.target)) setMenuDatosAbierto(false);
    }
    function handleEscape(event) {
      if (event.key === "Escape") {
        setAbierto(false); setEditorRegistroAbierto(false); setConfirmacionEdicion(null);
        setMenuDatosAbierto(false); setPromptColacionActiva(null); setModalFinalizar(null); setModalMetasAbierto(false);
        setModalRegistroAguaAbierto(false); setSelectorSemanaDiarioAbierto(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside, { passive: true });
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    if (esColacion) { setCampos(CAMPOS_VACIOS); return; }
    const guardado = registrosPrincipales[comida];
    if (!guardado) { setCampos(CAMPOS_VACIOS); return; }
    setCampos({ kcal: fromSaved(guardado.kcal), prot: fromSaved(guardado.prot), carb: fromSaved(guardado.carb), gras: fromSaved(guardado.gras), fibr: fromSaved(guardado.fibr), agua: fromSaved(guardado.agua) });
  }, [comida, esColacion, registrosPrincipales]);
  
  useEffect(() => {
    if (!mensaje) return;
    const timer = setTimeout(() => setMensaje(""), 2600);
    return () => clearTimeout(timer);
  }, [mensaje]);

  useEffect(() => {
    const styleId = "historial-scroll-rows-style";
    if (document.getElementById(styleId)) return;
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      .historial-scroll-rows { overflow-y: auto !important; -webkit-overflow-scrolling: touch; overscroll-behavior-y: contain; touch-action: pan-y; overflow-anchor: none; scrollbar-width: none; } .historial-scroll-rows::-webkit-scrollbar { width: 0; height: 0; display: none; }
      @keyframes pulseGlowBtn {
        0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(143, 216, 87, 0.7); }
        50% { transform: scale(1.15); box-shadow: 0 0 15px 8px rgba(143, 216, 87, 0); }
        100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(143, 216, 87, 0); }
      }
      .btn-guardar-latido {
        animation: pulseGlowBtn 1.8s infinite !important;
        background: #1a2a10 !important;
        border: 2px solid #8fd857 !important;
        font-size: 1.4rem !important;
        width: 48px !important;
        height: 48px !important;
        color: #8fd857 !important;
      }
@keyframes pulseSaveHome {
  0% { transform: scale(1); box-shadow: 0 0 0 rgba(80,160,255,0.18); }
  50% { transform: scale(1.02); box-shadow: 0 0 18px rgba(80,160,255,0.42); }
  100% { transform: scale(1); box-shadow: 0 0 0 rgba(80,160,255,0.18); }
}

    `;
    document.head.appendChild(style);
    return () => { const current = document.getElementById(styleId); if (current) current.remove(); };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const payload = { fechaKey: fechaHoyKey, fechaISO: fechaHoyISO, registrosPrincipales, registrosColaciones, aguaExtra, diaFinalizado, metasActuales, segmentosMetas };
    window.localStorage.setItem(STORAGE_CURRENT_DAY_KEY, JSON.stringify(payload));
    const hoyRealKey = formatDateKey(new Date());
    if (fechaHoyKey !== hoyRealKey && !diaFinalizado && dayStateHasEntries(payload)) {
      persistPendingDayState(payload);
    } else if (diaFinalizado || fechaHoyKey === hoyRealKey) {
      clearPendingDayState();
    }
  }, [fechaHoyISO, fechaHoyKey, registrosPrincipales, registrosColaciones, aguaExtra, diaFinalizado, metasActuales, segmentosMetas]);
  
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(historialDias));
  }, [historialDias]);
  
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_PROFILE_KEY, JSON.stringify(perfilUsuario));
  }, [perfilUsuario]);

  const totalesDia = useMemo(() => {
    const totalPrincipales = Object.values(registrosPrincipales).reduce((acc, item) => sumCampos(acc, item), { kcal: 0, prot: 0, carb: 0, gras: 0, fibr: 0, agua: 0 });
    const totalColaciones = Object.values(registrosColaciones).reduce((acc, item) => sumCampos(acc, item), { kcal: 0, prot: 0, carb: 0, gras: 0, fibr: 0, agua: 0 });
    const totalAguaExtra = aguaExtra.reduce((sum, item) => sum + item.agua, 0);
    const combinado = sumCampos(totalPrincipales, totalColaciones);
    return { ...combinado, agua: combinado.agua + totalAguaExtra };
  }, [registrosPrincipales, registrosColaciones, aguaExtra]);
  
  const metaEfectivaHoy = useMemo(() => calcularMetaEfectivaDia({ segmentosMetas, metasActuales, fechaISO: fechaHoyISO }), [segmentosMetas, metasActuales, fechaHoyISO]);
  const hayCambioMetasHoy = segmentosMetas.length > 1;
  
  useEffect(() => {
    if (!setupInicialCompleto) return;
    const metasPerfil = sanitizeMetas(perfilUsuario.metasBase, METAS_DIARIAS);
    const tienePerfilValido = Object.values(metasPerfil).every((value) => value > 0);
    if (!tienePerfilValido) return;
    const segmentoUnico = Array.isArray(segmentosMetas) && segmentosMetas.length === 1 ? segmentosMetas[0] : null;
    const metasSegmentoActual = sanitizeMetas(segmentoUnico?.metas, metasActuales);
    const hayCambioManualDeMetas = Array.isArray(segmentosMetas) && segmentosMetas.length > 1;
    const necesitaSincronizar = !hayCambioManualDeMetas && (!metasIguales(metasActuales, metasPerfil) || !metasIguales(metasSegmentoActual, metasPerfil));
    if (!necesitaSincronizar) return;
    setMetasActuales(metasPerfil);
    setCamposMetas({ kcal: String(metasPerfil.kcal), prot: String(metasPerfil.prot), carb: String(metasPerfil.carb), gras: String(metasPerfil.gras), fibr: String(metasPerfil.fibr), agua: String(metasPerfil.agua) });
    setSegmentosMetas([createMetaSegment(getStartOfDay(fechaHoyISO).toISOString(), metasPerfil, segmentoUnico?.id || null)]);
  }, [setupInicialCompleto, perfilUsuario, fechaHoyISO, metasActuales, segmentosMetas]);
  
  const proximaComidaPrincipal = useMemo(() => getNextMainMeal(registrosPrincipales), [registrosPrincipales]);
  const registrosIngresados = useMemo(() => buildRegistrosIngresados(registrosPrincipales, registrosColaciones, aguaExtra), [registrosPrincipales, registrosColaciones, aguaExtra]);
  const comidasPrincipalesPendientes = useMemo(() => getPendingMainMealsCount(registrosPrincipales), [registrosPrincipales]);
  const pendientesDia = useMemo(() => buildPendientesDia(registrosPrincipales, registrosColaciones), [registrosPrincipales, registrosColaciones]);
  const diaCompleto = pendientesDia.length === 0;
useEffect(() => {
  if (diaCompleto && !diaFinalizado) {
    setMostrarControlCierre(true);
    return;
  }
  setMostrarControlCierre(false);
  setHomeActualizadaActiva(false);
  setMenuDatosAbierto(false);
}, [diaCompleto, diaFinalizado, fechaHoyKey]);
  
  const estadoColacionAM = registrosColaciones["Colación AM"] ? true : false;
  const estadoColacionPM = registrosColaciones["Colación PM"] ? true : false;
  const estadoAlmuerzo = registrosPrincipales["Almuerzo"] ? true : false;

  let atajoColacion = { label: "COLACIÓN AM", icono: "🍎", ghost: false, target: "Colación AM" };
  if (!estadoColacionAM && !estadoAlmuerzo) {
      atajoColacion = { label: "COLACIÓN AM", icono: "🍎", ghost: false, target: "Colación AM" };
  } else if (estadoColacionAM && !estadoAlmuerzo) {
      atajoColacion = { label: "COLACIÓN AM", icono: "✅", ghost: true, target: null };
  } else if (estadoAlmuerzo && !estadoColacionPM) {
      atajoColacion = { label: "COLACIÓN PM", icono: "🥪", ghost: false, target: "Colación PM" };
  } else if (estadoColacionPM) {
      atajoColacion = { label: "COLACIÓN PM", icono: "✅", ghost: true, target: null };
  }
  
  const objetivoSugerencia = useMemo(() => {
    if (diaCompleto) return { label: "Día Completo", icono: "✅" };
    return (OPCIONES.find((o) => o.label === proximaComidaPrincipal) || { label: proximaComidaPrincipal || "Desayuno", icono: "🍽️" });
  }, [diaCompleto, proximaComidaPrincipal]);
  
  const datosSugerencia = useMemo(() => {
    const restante = {
      kcal: clampMinZero(metaEfectivaHoy.kcal - totalesDia.kcal), prot: clampMinZero(metaEfectivaHoy.prot - totalesDia.prot),
      carb: clampMinZero(metaEfectivaHoy.carb - totalesDia.carb), gras: clampMinZero(metaEfectivaHoy.gras - totalesDia.gras),
      fibr: clampMinZero(metaEfectivaHoy.fibr - totalesDia.fibr), agua: clampMinZero(metaEfectivaHoy.agua - totalesDia.agua),
    };
    const divisor = comidasPrincipalesPendientes;
    return [
      { titulo: "KCAL", icono: "🔥", valor: String(Math.round(restante.kcal / divisor)), unidad: "kcal", color: COLORES.kcal },
      { titulo: "PROT", icono: "🥩", valor: String(Math.round(restante.prot / divisor)), unidad: "gr", color: COLORES.prot },
      { titulo: "CARBS", icono: "🍞", valor: String(Math.round(restante.carb / divisor)), unidad: "gr", color: COLORES.carb },
      { titulo: "GRASAS", icono: "🥑", valor: String(Math.round(restante.gras / divisor)), unidad: "gr", color: COLORES.gras },
      { titulo: "FIBRA", icono: "🌿", valor: String(Math.round(restante.fibr / divisor)), unidad: "gr", color: COLORES.fibr },
      { titulo: "AGUA", icono: "💧", valor: String(Math.round(restante.agua / divisor)), unidad: "ml", color: COLORES.agua },
    ];
  }, [totalesDia, comidasPrincipalesPendientes, metaEfectivaHoy]);

  // 🔥 AQUÍ INYECTAMOS LOS COLORES PARA CADA TARJETA DE PROGRESO
  const itemsProgreso = [
    { key: "kcal", icono: "🔥", label: "KCAL", unidad: "kcal", actual: totalesDia.kcal, meta: metaEfectivaHoy.kcal, color: COLORES.kcal },
    { key: "prot", icono: "🥩", label: "PROT", unidad: "g", actual: totalesDia.prot, meta: metaEfectivaHoy.prot, color: COLORES.prot },
    { key: "carb", icono: "🍞", label: "CARBS", unidad: "g", actual: totalesDia.carb, meta: metaEfectivaHoy.carb, color: COLORES.carb },
    { key: "gras", icono: "🥑", label: "GRASAS", unidad: "g", actual: totalesDia.gras, meta: metaEfectivaHoy.gras, color: COLORES.gras },
    { key: "fibr", icono: "🌿", label: "FIBRA", unidad: "g", actual: totalesDia.fibr, meta: metaEfectivaHoy.fibr, color: COLORES.fibr },
    { key: "agua", icono: "💧", label: "AGUA", unidad: "ml", actual: totalesDia.agua, meta: metaEfectivaHoy.agua, color: COLORES.agua },
  ];
  
  const liveDaySnapshot = useMemo(() => buildDaySnapshot({ fechaKey: fechaHoyKey, fechaISO: fechaHoyISO, registrosPrincipales, registrosColaciones, aguaExtra, diaFinalizado, metasActuales, segmentosMetas, totalesDia, metaEfectiva: metaEfectivaHoy }), [fechaHoyKey, fechaHoyISO, registrosPrincipales, registrosColaciones, aguaExtra, diaFinalizado, metasActuales, segmentosMetas, totalesDia, metaEfectivaHoy]);
  const historialConHoy = useMemo(() => upsertHistorySnapshot(historialDias, liveDaySnapshot), [historialDias, liveDaySnapshot]);
  const weekSnapshots = useMemo(() => getWeekSnapshotsForRange(historialConHoy, fechaBaseHoy), [historialConHoy, fechaBaseHoy]);
  const monthSnapshots = useMemo(() => getMonthSnapshotsForRange(historialConHoy, fechaBaseHoy), [historialConHoy, fechaBaseHoy]);
  const dailyWeekSnapshots = useMemo(() => getWeekSnapshotsForRange(historialConHoy, fechaBaseReporteDiario), [historialConHoy, fechaBaseReporteDiario]);
  const rangoSemanaPreview = useMemo(() => formatRangoHistorialTexto(fechaBaseHoy), [fechaBaseHoy]);
  const rangoSemanaDiarioPreview = useMemo(() => formatRangoHistorialTexto(fechaBaseReporteDiario), [fechaBaseReporteDiario]);
  const resumenDiarioSemanaCerrados = useMemo(() => dailyWeekSnapshots.filter((row) => row?.diaFinalizado).slice(0, 7), [dailyWeekSnapshots]);
  const reporteDiarioEsSemanaActual = useMemo(() => formatDateKey(getStartOfWeek(fechaBaseReporteDiario)) === formatDateKey(getStartOfWeek(new Date())), [fechaBaseReporteDiario]);
  const puedeAvanzarReporteDiario = useMemo(() => getStartOfWeek(fechaBaseReporteDiario).getTime() < getStartOfWeek(new Date()).getTime(), [fechaBaseReporteDiario]);
  const resumenSemanalItems = useMemo(() => [
    { key: "kcal", icono: "🔥", label: "KCAL", unidad: "kcal", color: COLORES.kcal, actual: weekSnapshots.reduce((sum, item) => sum + item.totales.kcal, 0), meta: weekSnapshots.reduce((sum, item) => sum + item.metaEfectiva.kcal, 0) },
    { key: "prot", icono: "🥩", label: "PROT", unidad: "g", color: COLORES.prot, actual: weekSnapshots.reduce((sum, item) => sum + item.totales.prot, 0), meta: weekSnapshots.reduce((sum, item) => sum + item.metaEfectiva.prot, 0) },
    { key: "carb", icono: "🍞", label: "CARBS", unidad: "g", color: COLORES.carb, actual: weekSnapshots.reduce((sum, item) => sum + item.totales.carb, 0), meta: weekSnapshots.reduce((sum, item) => sum + item.metaEfectiva.carb, 0) },
    { key: "gras", icono: "🥑", label: "GRASAS", unidad: "g", color: COLORES.gras, actual: weekSnapshots.reduce((sum, item) => sum + item.totales.gras, 0), meta: weekSnapshots.reduce((sum, item) => sum + item.metaEfectiva.gras, 0) },
    { key: "fibr", icono: "🌿", label: "FIBRA", unidad: "g", color: COLORES.fibr, actual: weekSnapshots.reduce((sum, item) => sum + item.totales.fibr, 0), meta: weekSnapshots.reduce((sum, item) => sum + item.metaEfectiva.fibr, 0) },
    { key: "agua", icono: "💧", label: "AGUA", unidad: "ml", color: COLORES.agua, actual: weekSnapshots.reduce((sum, item) => sum + item.totales.agua, 0), meta: weekSnapshots.reduce((sum, item) => sum + item.metaEfectiva.agua, 0) },
  ], [weekSnapshots]);
  const hayCambioMetasSemana = useMemo(() => weekSnapshots.some((item) => item?.hayCambioMetas), [weekSnapshots]);
  const resumenMensualItems = useMemo(() => [
    { key: "kcal", icono: "🔥", label: "KCAL", unidad: "kcal", actual: monthSnapshots.reduce((sum, item) => sum + item.totales.kcal, 0), meta: monthSnapshots.reduce((sum, item) => sum + item.metaEfectiva.kcal, 0) },
    { key: "prot", icono: "🥩", label: "PROT", unidad: "g", actual: monthSnapshots.reduce((sum, item) => sum + item.totales.prot, 0), meta: monthSnapshots.reduce((sum, item) => sum + item.metaEfectiva.prot, 0) },
    { key: "carb", icono: "🍞", label: "CARBS", unidad: "g", actual: monthSnapshots.reduce((sum, item) => sum + item.totales.carb, 0), meta: monthSnapshots.reduce((sum, item) => sum + item.metaEfectiva.carb, 0) },
    { key: "gras", icono: "🥑", label: "GRASAS", unidad: "g", actual: monthSnapshots.reduce((sum, item) => sum + item.totales.gras, 0), meta: monthSnapshots.reduce((sum, item) => sum + item.metaEfectiva.gras, 0) },
    { key: "fibr", icono: "🌿", label: "FIBRA", unidad: "g", actual: monthSnapshots.reduce((sum, item) => sum + item.totales.fibr, 0), meta: monthSnapshots.reduce((sum, item) => sum + item.metaEfectiva.fibr, 0) },
    { key: "agua", icono: "💧", label: "AGUA", unidad: "ml", actual: monthSnapshots.reduce((sum, item) => sum + item.totales.agua, 0), meta: monthSnapshots.reduce((sum, item) => sum + item.metaEfectiva.agua, 0) },
  ], [monthSnapshots]);
  const historialDiarioBlocks = useMemo(() => {
    const visibles = historialConHoy.filter(isSnapshotVisibleInHistory).sort((a, b) => a.fechaKey.localeCompare(b.fechaKey));
    const ultimosSiete = visibles.slice(-7);
    return buildHistorialBlocks(ultimosSiete);
  }, [historialConHoy]);



  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!(vistaActual === "pdf" && (historialVista === "diario" || (historialVista === "preview" && pdfPreview?.titulo === "Resumen Diario")))) return;

    const calcularAlturaScrollResumenDiario = () => {
      const viewportHeight = window.innerHeight || 800;
      const stickyRect = resumenDiarioStickyRef.current?.getBoundingClientRect();
      const topOffset = stickyRect ? stickyRect.bottom : 280;
      const disponiblePantalla = Math.max(220, Math.floor(viewportHeight - topOffset - 10));
      const primeraFila = resumenDiarioRowsInnerRef.current?.querySelector?.("[data-resumen-row='1']");
      const alturaFilaMedida = primeraFila ? Math.ceil(primeraFila.getBoundingClientRect().height) : 112;
      const alturaFila = Math.max(96, alturaFilaMedida);
      const notaRect = resumenDiarioNotaRef.current?.getBoundingClientRect?.();
      const alturaNota = Math.max(56, Math.ceil(notaRect?.height || 72));
      const ajusteFinoScroll = 30;
      const parking = Math.max(0, Math.round(disponiblePantalla - alturaFila - alturaNota + ajusteFinoScroll));
      setResumenDiarioRowHeight(alturaFila);
      setResumenDiarioNotaHeight(alturaNota);
      setResumenDiarioParkingHeight(parking);
      setResumenDiarioScrollHeight(disponiblePantalla);
    };

    const raf = requestAnimationFrame(calcularAlturaScrollResumenDiario);
    window.addEventListener("resize", calcularAlturaScrollResumenDiario);
    window.addEventListener("orientationchange", calcularAlturaScrollResumenDiario);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", calcularAlturaScrollResumenDiario);
      window.removeEventListener("orientationchange", calcularAlturaScrollResumenDiario);
    };
  }, [vistaActual, historialVista, pdfPreview, resumenDiarioSemanaCerrados.length]);

  useEffect(() => {
    if (!(vistaActual === "pdf" && (historialVista === "diario" || (historialVista === "preview" && pdfPreview?.titulo === "Resumen Diario")))) return;
    const node = resumenDiarioRowsRef.current;
    if (!node) return;
    node.scrollTop = 0;
  }, [vistaActual, historialVista, pdfPreview?.titulo, fechaReporteDiarioKey, resumenDiarioSemanaCerrados.length]);


  function ejecutarRescate() {
    let rescued = null;
    if (typeof window !== "undefined") {
      const rawPending = safeJsonParse(window.localStorage.getItem(STORAGE_PENDING_DAY_KEY), null);
      if (rawPending?.fechaKey) {
        rescued = sanitizeCurrentDayState(rawPending, getDefaultDayState(parseDateFromKey(rawPending.fechaKey), metasActuales));
      }
    }

    if (rescued) {
      setFechaDiaActivo({ key: rescued.fechaKey, iso: rescued.fechaISO });
      setRegistrosPrincipales(rescued.registrosPrincipales);
      setRegistrosColaciones(rescued.registrosColaciones);
      setAguaExtra(rescued.aguaExtra);
      setDiaFinalizado(false);
      setMetasActuales(rescued.metasActuales);
      setSegmentosMetas(rescued.segmentosMetas);
    }

    setModoRescatePendiente(true);
    setModalRescateAbierto(false);
    setVistaActual("sugerencia");
    setMenuDatosAbierto(false);
    setAbierto(false);
    setHomeActualizadaActiva(false);
    setModoLectura(false);
    setModoPostGuardado(false);
    setMensaje("✏️ Día anterior recuperado. Puedes completar, modificar y guardar.");
  }
  function descartarRescate() { setModoRescatePendiente(false); iniciarNuevoDia(); }
  function iniciarNuevoDia() {
    clearPendingDayState();
    const nuevoDia = getDefaultDayState(new Date(), metasActuales);
    setFechaDiaActivo({ key: nuevoDia.fechaKey, iso: nuevoDia.fechaISO });
    setRegistrosPrincipales(nuevoDia.registrosPrincipales);
    setRegistrosColaciones(nuevoDia.registrosColaciones);
    setAguaExtra(nuevoDia.aguaExtra);
    setDiaFinalizado(nuevoDia.diaFinalizado);
    setSegmentosMetas([createMetaSegment(nuevoDia.fechaISO, metasActuales)]);
    setModoRescatePendiente(false);
    setModalRescateAbierto(false);
    setVistaActual("sugerencia");
    setHomeActualizadaActiva(false);
    setMensaje("✅ ¡Nuevo día iniciado!");
  }
  function goHome() { setVistaActual("sugerencia"); setHistorialVista("menu"); setPdfPreview(null); setMenuDatosAbierto(false); setAbierto(false); if (diaFinalizado || modoPostGuardado) { setModoPostGuardado(true); setModoLectura(false); } }

  function moverReporteDiarioSemanas(delta) {
    setFechaReporteDiarioKey((prev) => {
      const base = parseDateFromKey(prev);
      base.setDate(base.getDate() + delta * 7);
      return formatDateKey(base);
    });
    setPdfPreview(null);
  }

  function irReporteDiarioSemanaActual() {
    setFechaReporteDiarioKey(formatDateKey(new Date()));
    setFechaSelectorDiario(formatDateKey(new Date()));
    setPdfPreview(null);
  }

  function abrirSelectorSemanaDiario() {
    const fechaBase = fechaReporteDiarioKey || formatDateKey(new Date());
    setFechaSelectorDiario(fechaBase);
    setSelectorSemanaDiarioAbierto(true);
  }

  function aplicarFechaSelectorSemanaDiario(fechaElegidaKey) {
    if (!fechaElegidaKey) return;
    const fechaElegida = parseDateFromKey(fechaElegidaKey);
    if (Number.isNaN(fechaElegida.getTime())) return;
    const hoy = getStartOfDay(new Date());
    if (getStartOfDay(fechaElegida).getTime() > hoy.getTime()) return;
    setFechaSelectorDiario(formatDateKey(fechaElegida));
  }

  function confirmarSelectorSemanaDiario() {
    const fechaElegida = parseDateFromKey(fechaSelectorDiario || fechaReporteDiarioKey || formatDateKey(new Date()));
    if (Number.isNaN(fechaElegida.getTime())) {
      setSelectorSemanaDiarioAbierto(false);
      return;
    }
    const hoy = getStartOfDay(new Date());
    const fechaFinal = getStartOfDay(fechaElegida).getTime() > hoy.getTime() ? hoy : fechaElegida;
    const nuevaFechaKey = formatDateKey(fechaFinal);
    setFechaSelectorDiario(nuevaFechaKey);
    setFechaReporteDiarioKey(nuevaFechaKey);
    setSelectorSemanaDiarioAbierto(false);
    setPdfPreview(null);
  }

  function seleccionarSemanaActualEnCalendarioDiario() {
    setFechaSelectorDiario(formatDateKey(new Date()));
  }

  function cancelarSelectorSemanaDiario() {
    setFechaSelectorDiario(fechaReporteDiarioKey || formatDateKey(new Date()));
    setSelectorSemanaDiarioAbierto(false);
  }

  function getBackupLocalStorageKeys() {
    if (typeof window === "undefined") return [];
    const clavesFijas = [
      STORAGE_PROFILE_KEY,
      STORAGE_CURRENT_DAY_KEY,
      STORAGE_HISTORY_KEY,
      STORAGE_PENDING_DAY_KEY,
      "usuarioConfig",
      "historial",
    ];
    const clavesDetectadas = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key) continue;
      if (key.startsWith("nutri_app_") || key === "usuarioConfig" || key === "historial") clavesDetectadas.push(key);
    }
    return Array.from(new Set([...clavesFijas, ...clavesDetectadas]));
  }

  function exportarRespaldoDatos() {
    if (typeof window === "undefined") return;
    try {
      const datos = {};
      getBackupLocalStorageKeys().forEach((key) => {
        const value = window.localStorage.getItem(key);
        if (value !== null && value !== undefined) datos[key] = value;
      });

      if (Object.keys(datos).length === 0) {
        setMensaje("⚠️ No encontré datos guardados para exportar.");
        return;
      }

      const nombreRespaldo = String((perfilUsuario?.nombre || getStoredUserName() || "usuario")).trim() || "usuario";
      const nombreArchivoSeguro = nombreRespaldo
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "usuario";
      const fechaArchivo = formatDateKey(new Date());
      const payload = {
        tipo: "control-nutricional-respaldo",
        version: 1,
        exportadoEn: new Date().toISOString(),
        nombre: nombreRespaldo,
        datos,
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `control-nutricional-${nombreArchivoSeguro}-${fechaArchivo}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setMensaje("✅ Respaldo exportado. Guárdalo para importarlo en Vercel.");
      setMenuDatosAbierto(false);
    } catch (error) {
      console.error("Error exportando respaldo", error);
      setMensaje("❌ No pude exportar el respaldo.");
    }
  }

  function abrirImportarRespaldoDatos() {
    setMenuDatosAbierto(false);
    backupFileInputRef.current?.click();
  }

  async function importarRespaldoDatos(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const contenido = await file.text();
      const parsed = JSON.parse(contenido);
      const datos = parsed?.datos || parsed?.localStorage || parsed;
      if (!datos || typeof datos !== "object" || Array.isArray(datos)) {
        setMensaje("❌ El archivo de respaldo no tiene el formato correcto.");
        return;
      }

      const confirmado = window.confirm(
        "¿Importar este respaldo? La app se reiniciará y usará los datos de ese archivo en este teléfono."
      );
      if (!confirmado) return;

      getBackupLocalStorageKeys().forEach((key) => {
        if (key.startsWith("nutri_app_") || key === "usuarioConfig" || key === "historial") {
          window.localStorage.removeItem(key);
        }
      });

      Object.entries(datos).forEach(([key, value]) => {
        if (!(key.startsWith("nutri_app_") || key === "usuarioConfig" || key === "historial")) return;
        if (value === null || value === undefined) return;
        window.localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
      });

      setMensaje("✅ Respaldo importado. Reiniciando app...");
      setTimeout(() => window.location.reload(), 500);
    } catch (error) {
      console.error("Error importando respaldo", error);
      setMensaje("❌ No pude importar el respaldo. Revisa que sea el archivo correcto.");
    } finally {
      event.target.value = "";
    }
  }

  const inputRespaldoOculto = (
    <input
      ref={backupFileInputRef}
      type="file"
      accept="application/json,.json"
      style={{ display: "none" }}
      onChange={importarRespaldoDatos}
    />
  );

  function handleCampoInicioChange(nombre, valor) {
    if (nombre === "nombre") { setCamposInicio((prev) => ({ ...prev, nombre: valor })); return; }
    if (valor === "") { setCamposInicio((prev) => ({ ...prev, [nombre]: "" })); return; }
    const limpio = valor.replace(",", ".");
    if (!/^\d*\.?\d*$/.test(limpio)) return;
    setCamposInicio((prev) => ({ ...prev, [nombre]: limpio }));
  }

  function confirmarSetupInicial() {
    const nombreLimpio = String(camposInicio.nombre || "").trim();
    if (!nombreLimpio) { setMensaje("❌ Ingresa tu nombre para continuar"); return; }
    const metasInicio = {
      kcal: toNumber(camposInicio.kcal), prot: toNumber(camposInicio.prot), carb: toNumber(camposInicio.carb),
      gras: toNumber(camposInicio.gras), fibr: toNumber(camposInicio.fibr), agua: toNumber(camposInicio.agua),
    };
    if (Object.values(metasInicio).some((value) => value <= 0)) { setMensaje("❌ Todas las metas iniciales deben ser mayores a cero"); return; }
    const perfilNuevo = { nombre: nombreLimpio, metasBase: metasInicio, setupCompleto: true };
    const hayDatosPrevios = historialDias.length > 0 || hasAnyIntake(totalesDia) || diaFinalizado;
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_PROFILE_KEY, JSON.stringify(perfilNuevo));
    setPerfilUsuario(perfilNuevo);
    setSetupInicialCompleto(true);
    const nuevoDia = getDefaultDayState(new Date(), metasInicio);
    if (!hayDatosPrevios) {
      setRegistrosPrincipales(nuevoDia.registrosPrincipales); setRegistrosColaciones(nuevoDia.registrosColaciones);
      setAguaExtra(nuevoDia.aguaExtra); setDiaFinalizado(false);
    }
    setMetasActuales(metasInicio);
    setSegmentosMetas([createMetaSegment(getStartOfDay(fechaHoyISO).toISOString(), metasInicio)]);
    setCamposMetas({ kcal: String(metasInicio.kcal), prot: String(metasInicio.prot), carb: String(metasInicio.carb), gras: String(metasInicio.gras), fibr: String(metasInicio.fibr), agua: String(metasInicio.agua) });
    setVistaActual("sugerencia");
    setMensaje(`✅ Bienvenido, ${nombreLimpio}`);
  }

  function handleCampoChange(nombre, valor) {
    if (valor === "") { setCampos((prev) => ({ ...prev, [nombre]: "" })); return; }
    const limpio = valor.replace(",", ".");
    if (!/^\d*\.?\d*$/.test(limpio)) return;
    setCampos((prev) => ({ ...prev, [nombre]: limpio }));
  }

  function handleCampoMetaChange(nombre, valor) {
    if (valor === "") { setCamposMetas((prev) => ({ ...prev, [nombre]: "" })); return; }
    const limpio = valor.replace(",", ".");
    if (!/^\d*\.?\d*$/.test(limpio)) return;
    setCamposMetas((prev) => ({ ...prev, [nombre]: limpio }));
  }

  function resetCampos() { setCampos(CAMPOS_VACIOS); }

  function iniciarRegistroPrincipal() {
    if (!proximaComidaPrincipal) return;
    const colacionAMPendiente = proximaComidaPrincipal === "Almuerzo" && !registrosColaciones["Colación AM"];
    const colacionPMPendiente = proximaComidaPrincipal === "Cena" && !registrosColaciones["Colación PM"];

    if (colacionAMPendiente) {
      setPromptColacionActiva({ label: "Colación AM", icono: "🍎", nextMain: "Almuerzo" });
      return;
    }
    if (colacionPMPendiente) {
      setPromptColacionActiva({ label: "Colación PM", icono: "🥪", nextMain: "Cena" });
      return;
    }
    setComida(proximaComidaPrincipal);
    setVistaActual("registro");
  }

  function iniciarRegistroAgua() {
    setCampos(CAMPOS_VACIOS);
    setModalRegistroAguaAbierto(true);
    setMenuDatosAbierto(false);
  }

  function iniciarRegistroColacion() {
    if (atajoColacion.ghost || !atajoColacion.target) return;
    if (atajoColacion.target === "Colación AM" && !registrosPrincipales.Desayuno) {
      setAlertaDesayunoSaltado(true);
      return;
    }
    setComida(atajoColacion.target);
    setVistaActual("registro");
  }

  function irADesayunoDesdeAlerta() {
    setAlertaDesayunoSaltado(false);
    setComida("Desayuno");
    setVistaActual("registro");
  }

  function continuarAColacionDesdeAlerta() {
    setAlertaDesayunoSaltado(false);
    setComida("Colación AM");
    setVistaActual("registro");
  }

  function resolverColacionEnCero(label, nextMain) {
    setRegistrosColaciones((prev) => ({ ...prev, [label]: { ...REGISTRO_CERO, _resueltaEnCero: true, _timestamp: new Date().toISOString() } }));
    setPromptColacionActiva(null);
    if (nextMain) { setComida(nextMain); setVistaActual("registro"); }
    setMensaje(`✅ ${label} marcada en cero`);
  }

  function irARegistrarColacion(label) { setComida(label); setPromptColacionActiva(null); setVistaActual("registro"); }

  function ejecutarGuardarAguaFlotante() {
    const aguaAingresar = toNumber(campos.agua);
    if (aguaAingresar <= 0) { setMensaje("❌ Ingresa una cantidad de agua"); return; }
    const segmentoActivo = getSegmentoMetaActivo(segmentosMetas);
    setAguaExtra((prev) => [...prev, { id: Date.now(), agua: aguaAingresar, _timestamp: new Date().toISOString(), _segmentId: segmentoActivo?.id || null }]);
    setMensaje("✅ Agua registrada");
    setModalRegistroAguaAbierto(false);
    resetCampos();
  }

  function solicitarGuardarRegistro() {
    const registroBase = { kcal: toNumber(campos.kcal), prot: toNumber(campos.prot), carb: toNumber(campos.carb), gras: toNumber(campos.gras), fibr: toNumber(campos.fibr), agua: toNumber(campos.agua) };
    const totalIngresado = registroBase.kcal + registroBase.prot + registroBase.carb + registroBase.gras + registroBase.fibr + registroBase.agua;
    if (totalIngresado <= 0) { setMensaje("❌ Ingresa al menos un valor"); return; }
    
    setModalConfirmacionIngesta({ accion: "guardar", comida: comida });
  }

  function solicitarOmitirRegistro() {
    setModalConfirmacionIngesta({ accion: "omitir", comida: comida });
  }

  function ejecutarAccionIngesta() {
    if (!modalConfirmacionIngesta) return;
    const { accion, comida: comidaTarget } = modalConfirmacionIngesta;
    const segmentoActivo = getSegmentoMetaActivo(segmentosMetas);
    const segmentId = segmentoActivo?.id || null;

    if (accion === "guardar") {
      const registroBase = { kcal: toNumber(campos.kcal), prot: toNumber(campos.prot), carb: toNumber(campos.carb), gras: toNumber(campos.gras), fibr: toNumber(campos.fibr), agua: toNumber(campos.agua) };
      if (esColacion) {
        setRegistrosColaciones((prev) => ({ ...prev, [comidaTarget]: buildStoredRegistro(registroBase, segmentId) }));
        setMensaje(`✅ ${comidaTarget} guardada`);
      } else {
        setRegistrosPrincipales((prev) => ({ ...prev, [comidaTarget]: buildStoredRegistro(registroBase, segmentId) }));
        setMensaje(`✅ ${comidaTarget} guardada`);
      }
    } else if (accion === "omitir") {
      const registroCero = { ...REGISTRO_CERO, _resueltaEnCero: true };
      if (esColacion) {
        setRegistrosColaciones((prev) => ({ ...prev, [comidaTarget]: buildStoredRegistro(registroCero, segmentId) }));
      } else {
        setRegistrosPrincipales((prev) => ({ ...prev, [comidaTarget]: buildStoredRegistro(registroCero, segmentId) }));
      }
      setMensaje(`✅ ${comidaTarget} omitida en cero`);
    }

    setModalConfirmacionIngesta(null);
    resetCampos();
    setVistaActual("sugerencia");
  }

  function handleCampoEdicionChange(nombre, valor) {
    if (valor === "") { setCamposEdicion((prev) => ({ ...prev, [nombre]: "" })); return; }
    const limpio = valor.replace(",", ".");
    if (!/^\d*\.?\d*$/.test(limpio)) return;
    setCamposEdicion((prev) => ({ ...prev, [nombre]: limpio }));
  }

  function abrirEditorRegistro(item) {
    setRegistroActivo(item);
    setCamposEdicion({ kcal: fromSaved(item.registro.kcal), prot: fromSaved(item.registro.prot), carb: fromSaved(item.registro.carb), gras: fromSaved(item.registro.gras), fibr: fromSaved(item.registro.fibr), agua: fromSaved(item.registro.agua) });
    setEditorRegistroAbierto(true);
  }

  function cerrarEditorRegistro() { setConfirmacionEdicion(null); setEditorRegistroAbierto(false); setRegistroActivo(null); setCamposEdicion(CAMPOS_VACIOS); }
  
  function solicitarActualizarRegistroActivo() {
    if (!registroActivo) return;
    setConfirmacionEdicion({ tipo: "actualizar", titulo: "CONFIRMAR CAMBIOS", mensaje: "¿Deseas actualizar esta ingesta?", detalle: "Se actualizarán los valores en Hoy y Tus Registros.", boton: "ACTUALIZAR", peligro: false });
  }
  
  function solicitarBorrarRegistroActivo() {
    if (!registroActivo) return;
    setConfirmacionEdicion({ tipo: "borrar", titulo: "BORRAR REGISTRO", mensaje: "¿Deseas borrar este registro completo?", detalle: "La ingesta se borrará de Tus Registros.", boton: "BORRAR", peligro: true });
  }
  
  function confirmarAccionEdicion() {
    if (!registroActivo || !confirmacionEdicion) return;
    if (confirmacionEdicion.tipo === "actualizar") {
      const registroActualizado = { ...registroActivo.registro, kcal: toNumber(camposEdicion.kcal), prot: toNumber(camposEdicion.prot), carb: toNumber(camposEdicion.carb), gras: toNumber(camposEdicion.gras), fibr: toNumber(camposEdicion.fibr), agua: toNumber(camposEdicion.agua) };
      if (registroActivo.tipo === "principal") setRegistrosPrincipales((prev) => ({ ...prev, [registroActivo.label]: registroActualizado }));
      else if (registroActivo.tipo === "colacion") setRegistrosColaciones((prev) => ({ ...prev, [registroActivo.label]: registroActualizado }));
      else if (registroActivo.tipo === "agua") {
        const aguaNueva = toNumber(registroActualizado.agua);
        const segmentoActivo = getSegmentoMetaActivo(segmentosMetas);
        setAguaExtra(aguaNueva > 0 ? [{ id: Date.now(), agua: aguaNueva, _timestamp: new Date().toISOString(), _segmentId: segmentoActivo?.id || null }] : []);
      }
      setMensaje(`✅ ${registroActivo.label} actualizada`); 
    }
    if (confirmacionEdicion.tipo === "borrar") {
      if (registroActivo.tipo === "principal") setRegistrosPrincipales((prev) => ({ ...prev, [registroActivo.label]: null }));
      else if (registroActivo.tipo === "colacion") setRegistrosColaciones((prev) => ({ ...prev, [registroActivo.label]: null }));
      else if (registroActivo.tipo === "agua") setAguaExtra([]); 
      setMensaje(`✅ ${registroActivo.label} eliminada`); 
    }
    cerrarEditorRegistro();
  }

  function abrirFinalizarDia() { setModalFinalizar({ pendientes: pendientesDia, puedeFinalizar: pendientesDia.length === 0 }); }
  function cerrarFinalizarDia() { setModalFinalizar(null); }
  function confirmarFinalizarDia() {
    const snapshot = buildDaySnapshot({ fechaKey: fechaHoyKey, fechaISO: fechaHoyISO, registrosPrincipales, registrosColaciones, aguaExtra, diaFinalizado: true, metasActuales, segmentosMetas, totalesDia, metaEfectiva: metaEfectivaHoy });
    const hoyRealKey = formatDateKey(new Date());
    const guardandoDiaPendiente = fechaHoyKey !== hoyRealKey;
    setDiaFinalizado(true);
    setHistorialDias((prev) => upsertHistorySnapshot(prev, snapshot));
    setModalFinalizar(null);
    setVistaActual("sugerencia");
    setModoLectura(false);
    setModoPostGuardado(true);
    setHomeActualizadaActiva(false);
    setMostrarControlCierre(false);
    if (guardandoDiaPendiente) {
      clearPendingDayState();
      setModoRescatePendiente(false);
      setMensaje("✅ Día recuperado guardado. Continuando con hoy");
      setTimeout(() => iniciarNuevoDia(), 80);
      return;
    }
    setMensaje("✅ Día guardado y finalizado");
  }
  function abrirModalMetas() { setCamposMetas({ kcal: String(metasActuales.kcal), prot: String(metasActuales.prot), carb: String(metasActuales.carb), gras: String(metasActuales.gras), fibr: String(metasActuales.fibr), agua: String(metasActuales.agua) }); setMenuDatosAbierto(false); setModalMetasAbierto(true); }
  function cerrarModalMetas() { setModalMetasAbierto(false); }
  function confirmarCambioMetas() {
    if (diaFinalizado) { setMensaje("❌ El día ya fue finalizado."); setModalMetasAbierto(false); return; }
    const nuevasMetas = { kcal: toNumber(camposMetas.kcal), prot: toNumber(camposMetas.prot), carb: toNumber(camposMetas.carb), gras: toNumber(camposMetas.gras), fibr: toNumber(camposMetas.fibr), agua: toNumber(camposMetas.agua) };
    if (Object.values(nuevasMetas).some((value) => value <= 0)) { setMensaje("❌ Todas las metas deben ser mayores a cero."); return; }
    if (Object.keys(nuevasMetas).every((key) => nuevasMetas[key] === metasActuales[key])) { setModalMetasAbierto(false); return; }
    const nowIso = new Date().toISOString();
    const nuevoSegmento = createMetaSegment(nowIso, nuevasMetas);
    setSegmentosMetas((prev) => {
      const current = Array.isArray(prev) && prev.length > 0 ? [...prev] : [createMetaSegment(getStartOfDay(fechaHoyISO).toISOString(), metasActuales)];
      const lastIndex = current.length - 1;
      if (lastIndex >= 0) { current[lastIndex] = { ...current[lastIndex], endAt: nowIso }; }
      return [...current, nuevoSegmento];
    });
    setMetasActuales(nuevasMetas); setModalMetasAbierto(false); setVistaActual("progreso"); setMensaje("✅ Metas actualizadas");
  }

  function buildPdfHtml({ tituloExportacion, contenido }) {
    const fechaPeriodoPdf = tituloExportacion === "Resumen Diario" ? fechaBaseReporteDiario : fechaBaseHoy;
    const periodoLabel = tituloExportacion === "Resumen Diario" ? formatRangoHistorialTexto(fechaPeriodoPdf) : getPeriodoPdfLabel(tituloExportacion, fechaPeriodoPdf);
    const nombreEncabezado = escapeHtml(nombreUsuario || "Usuario");
    const tituloSeguro = escapeHtml(tituloExportacion || "Resumen");
    const periodoSeguro = escapeHtml(periodoLabel || "");
    const esSemanal = tituloExportacion === "Resumen Semanal";
    const esMensual = tituloExportacion === "Resumen Mensual";
    const esDiario = tituloExportacion === "Resumen Diario";
    const avisoMetas = esSemanal && hayCambioMetasSemana
      ? `<div class="pdf-warning">⚠️ 🔀 Metas combinadas en la semana</div>`
      : esMensual && monthSnapshots.some((item) => item?.hayCambioMetas)
        ? `<div class="pdf-warning">⚠️ 🔀 Metas combinadas en el mes</div>`
        : esDiario && dailyWeekSnapshots.some((item) => item?.hayCambioMetas)
          ? `<div class="pdf-warning">⚠️ 🔀 Metas combinadas en el período mostrado</div>`
          : "";
    const notaTexto = esDiario
      ? "Este informe muestra los días cerrados visibles del período. En cada nutriente, el valor superior representa el consumo registrado y el valor inferior representa la meta correspondiente."
      : esSemanal
        ? "Este informe muestra el avance real de la semana por nutriente. La comparación se realiza contra la meta total semanal construida con la meta efectiva de cada día."
        : esMensual
          ? "Este informe muestra el avance real del mes por nutriente. La comparación se realiza contra la meta total mensual construida con la meta efectiva de cada día."
          : "Este informe muestra el consumo real comparado con la meta establecida.";

    const headerHtml = `
      <header class="pdf-header">
        <div class="pdf-title">${tituloSeguro}</div>
        <div class="pdf-user">${nombreEncabezado}</div>
        <div class="pdf-period">${periodoSeguro}</div>
      </header>`;

    const footerHtml = `
      <section class="pdf-note">
        <strong>Nota:</strong> ${escapeHtml(notaTexto)}
      </section>
      <footer class="pdf-footer">Informe generado desde Control Nutricional</footer>`;

    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${tituloSeguro}</title><style>
:root { color-scheme: light only !important; }
* { box-sizing: border-box; }
html, body { background: #ffffff !important; color: #111827 !important; font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
body { padding: 18px; }
.sheet { width: 100%; max-width: 920px; margin: 0 auto; background: #ffffff !important; color: #111827 !important; border: 1px solid #d7dde8; border-radius: 18px; padding: 18px; box-shadow: none !important; }
.pdf-header { background: #ffffff !important; border: 2px solid #d7dde8; border-radius: 18px; padding: 14px 12px 13px; text-align: center; margin-bottom: 14px; }
.pdf-title { color: #0f172a !important; font-size: 24px; line-height: 1.08; font-weight: 900; letter-spacing: 0.2px; }
.pdf-user { color: #1f2937 !important; font-size: 15px; font-weight: 800; margin-top: 6px; }
.pdf-period { color: #475569 !important; font-size: 12px; font-weight: 700; margin-top: 4px; }
.pdf-warning { background: #fff7ed !important; color: #9a3412 !important; border: 1px solid #fed7aa; border-radius: 14px; padding: 9px 10px; text-align: center; font-size: 12px; font-weight: 900; margin: -2px 0 12px; }
.metrics { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 4px 0 14px; }
.metric { background: #ffffff !important; color: #111827 !important; border: 1.5px solid #d7dde8; border-radius: 16px; padding: 12px; min-height: 145px; line-height: 1.2; font-size: 12px; font-weight: 700; display: grid; grid-template-columns: minmax(0, 1fr) 76px; gap: 8px; align-items: stretch; page-break-inside: avoid; }
.metric-left { min-width: 0; display: flex; flex-direction: column; justify-content: space-between; }
.metric-title { display: flex; align-items: center; gap: 6px; color: #0f172a !important; font-size: 15px; margin-bottom: 8px; font-weight: 900; line-height: 1.05; }
.metric-icon { font-size: 19px; line-height: 1; }
.metric-values { display: grid; gap: 6px; }
.metric-value-block { padding-bottom: 6px; border-bottom: 1px solid #e5eaf2; }
.metric-value-block:last-child { border-bottom: none; padding-bottom: 0; }
.metric-number { color: #0f172a !important; font-size: 18px; font-weight: 900; line-height: 1.05; letter-spacing: 0.1px; }
.metric-unit { font-size: 11px; font-weight: 700; margin-left: 3px; color: #111827 !important; }
.metric-label { color: #526071 !important; font-size: 11px; font-weight: 700; margin-top: 3px; }
.metric-progress-row { display: flex; align-items: center; gap: 7px; margin-top: 8px; white-space: nowrap; }
.metric-progress-icon { width: 24px; height: 24px; border: 1.5px solid #ff7a00; color: #ff7a00; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 900; flex: 0 0 auto; }
.metric-progress-label { color: #0f172a !important; font-size: 13px; font-weight: 900; }
.metric-progress-value { color: #f97316 !important; font-size: 14px; font-weight: 900; margin-left: 2px; }
.metric-meter-wrap { display: flex; align-items: center; justify-content: center; gap: 7px; }
.metric-meter { width: 22px; height: 112px; border-radius: 999px; background: #eef0f4 !important; position: relative; overflow: hidden; flex: 0 0 auto; }
.metric-meter-fill { position: absolute; left: 0; right: 0; bottom: 0; height: var(--pct); min-height: 6px; border-radius: 999px; background: linear-gradient(180deg, var(--accent2), var(--accent1)) !important; }
 .metric-scale { height: 112px; width: 44px; position: relative; color: #475569 !important; font-size: 10.5px; font-weight: 700; flex: 0 0 44px; }
.metric-scale span { position: absolute; left: 0; display: flex; align-items: center; line-height: 1; white-space: nowrap; }
.metric-scale span:nth-child(1) { top: 0; transform: translateY(-50%); }
.metric-scale span:nth-child(2) { top: 50%; transform: translateY(-50%); }
.metric-scale span:nth-child(3) { bottom: 0; transform: translateY(50%); }
.metric-scale span::before { content: "—"; color: #b7c0cc; margin-right: 7px; font-weight: 900; }
.daily-shell { background: #ffffff !important; color: #111827 !important; border: 1.5px solid #d7dde8; border-radius: 16px; padding: 10px; margin-bottom: 14px; }
.daily-head { background: #eef4ff !important; border: 1px solid #c8d7f2; border-radius: 12px; padding: 8px 7px; margin: 0 0 8px; }
.daily-header-row, .daily-row { display: grid; grid-template-columns: 78px repeat(6, minmax(44px, 1fr)); gap: 5px; align-items: center; }
.daily-header-cell { text-align: center; color: #0f172a !important; font-size: 8.5px; font-weight: 900; line-height: 1.06; text-transform: uppercase; }
.daily-header-cell span { display: block; font-size: 15px; margin-bottom: 2px; }
.daily-scroll { overflow: visible !important; max-height: none !important; }
.daily-block { background: #ffffff !important; color: #111827 !important; border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 8px; overflow: hidden; }
.daily-row { padding: 10px 7px; }
.daily-date { color: #111827 !important; font-size: 9px; font-weight: 900; line-height: 1.05; text-transform: uppercase; text-align: center; }
.daily-date small { display: block; color: #475569 !important; font-size: 8.5px; font-weight: 800; margin-top: 2px; line-height: 1.05; }
.daily-cell { text-align: center; min-width: 0; }
.daily-actual { color: #0f172a !important; font-size: 10.5px; font-weight: 900; line-height: 1; white-space: nowrap; }
.daily-meta { color: #64748b !important; font-size: 8px; font-weight: 800; line-height: 1; margin-top: 4px; white-space: nowrap; }
.daily-combined-note { color: #9a3412 !important; background: #fff7ed !important; border-top: 1px solid #fed7aa; text-align: center; font-size: 10px; font-weight: 900; padding: 6px; }
.daily-empty { background: #f8fafc !important; color: #475569 !important; border: 1px solid #d7dde8; border-radius: 14px; padding: 20px 14px; text-align: center; font-weight: 800; }
.pdf-note { background: #f8fafc !important; color: #334155 !important; border: 1px solid #d7dde8; border-radius: 14px; padding: 10px 12px; font-size: 11px; line-height: 1.35; margin-top: 12px; }
.pdf-note strong { color: #0f172a !important; }
.pdf-footer { text-align: center; color: #64748b !important; font-size: 10px; font-weight: 800; margin-top: 10px; padding-top: 8px; border-top: 1px solid #e2e8f0; }
table { width: 100%; border-collapse: collapse; }
th, td { border: 1px solid #d9e3f0; padding: 8px 6px; text-align: center; }
@media print { body { padding: 0; background: #ffffff !important; } .sheet { border: none; border-radius: 0; max-width: none; } }
</style></head><body><main class="sheet">${headerHtml}${avisoMetas}${contenido}${footerHtml}</main></body></html>`;
  }

  function abrirVentanaImpresion(htmlDoc, tituloExportacion) {
    if (typeof window === "undefined") return;
    const popup = window.open("", "_blank", "width=1100,height=1400");
    if (!popup) { setMensaje("❌ Permite ventanas emergentes"); return; }
    popup.document.write(htmlDoc); popup.document.close();
    setTimeout(() => { try { popup.focus(); popup.print(); } catch {} }, 250);
  }

  function imprimirPreviewActual() {
    try { const frameWindow = previewFrameRef.current?.contentWindow; if (frameWindow && typeof frameWindow.print === "function") { frameWindow.focus(); frameWindow.print(); return; } } catch {}
    if (pdfPreview?.html) abrirVentanaImpresion(pdfPreview.html, pdfPreview.titulo);
  }

  async function generarBlobPdfDesdePreview() {
    const iframe = previewFrameRef.current;
    const doc = iframe?.contentDocument || iframe?.contentWindow?.document;
    const body = doc?.body;
    if (!body) throw new Error("preview-unavailable");

    const canvas = await html2canvas(body, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      windowWidth: Math.max(body.scrollWidth || 0, doc?.documentElement?.scrollWidth || 0, 980),
      windowHeight: Math.max(body.scrollHeight || 0, doc?.documentElement?.scrollHeight || 0, 1400),
    });

    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgHeight = (canvas.height * pageWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, "PNG", 0, position, pageWidth, imgHeight, undefined, "FAST");
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, pageWidth, imgHeight, undefined, "FAST");
      heightLeft -= pageHeight;
    }

    return pdf.output("blob");
  }

  async function compartirPreviewActual() {
    try {
      setMensaje("⏳ Generando PDF...");

      const blob = await generarBlobPdfDesdePreview();
      const fechaArchivoPdf = pdfPreview?.fechaKey ? parseDateFromKey(pdfPreview.fechaKey) : fechaBaseHoy;
      const nombreArchivo = buildPdfFileName(pdfPreview?.titulo || "reporte", fechaArchivoPdf);
      const tituloShare = pdfPreview?.titulo || "Reporte nutricional";
      const textoShare = `${tituloShare} · ${nombreUsuario || "Usuario"}`;

      let file = null;
      try {
        file = new File([blob], nombreArchivo, { type: "application/pdf" });
      } catch (fileError) {
        console.warn("Este navegador no pudo crear el archivo PDF para compartir", fileError);
      }

      const compartirNativoDisponible =
        typeof navigator !== "undefined" &&
        typeof navigator.share === "function" &&
        file;

      let puedeCompartirArchivo = false;
      if (compartirNativoDisponible) {
        if (typeof navigator.canShare === "function") {
          try {
            puedeCompartirArchivo = navigator.canShare({ files: [file] });
          } catch (canShareError) {
            console.warn("El navegador no confirmó soporte para compartir archivos", canShareError);
            puedeCompartirArchivo = false;
          }
        } else {
          // Algunos navegadores antiguos no tienen canShare, pero sí permiten probar navigator.share.
          puedeCompartirArchivo = true;
        }
      }

      if (puedeCompartirArchivo) {
        try {
          await navigator.share({ files: [file], title: tituloShare, text: textoShare });
          setMensaje("✅ PDF listo para enviar");
          return;
        } catch (shareError) {
          const cancelled = shareError?.name === "AbortError";
          if (cancelled) {
            setMensaje("ℹ️ Envío cancelado");
            return;
          }
          console.warn("No se pudo abrir el menú nativo para compartir PDF", shareError);
        }
      }

      const url = URL.createObjectURL(blob);
      let abierto = null;
      try {
        abierto = window.open(url, "_blank", "noopener,noreferrer");
      } catch (openError) {
        console.warn("No se pudo abrir el PDF en otra pestaña", openError);
      }

      if (abierto) {
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        setMensaje("⚠️ Tu navegador no permite compartir este PDF como archivo. Abrí el PDF; usa el botón compartir del teléfono o del navegador.");
        return;
      }

      const link = document.createElement("a");
      link.href = url;
      link.download = nombreArchivo;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 8000);
      setMensaje("⚠️ Tu navegador no permite compartir este PDF como archivo. Lo descargué; adjúntalo manualmente en WhatsApp, Email, Mensajes o Drive.");
    } catch (error) {
      console.error("Error generando o compartiendo PDF", error);
      setMensaje("❌ No se pudo generar el PDF");
    }
  }

  function exportarResumen(tipo, abrirPreview = true) {
    if (typeof window === "undefined") return;
    const buildMetricCards = (items, periodo = "semanal") => `<div class="metrics">${items.map((item) => {
        const porcentajeRaw = item.meta > 0 ? Math.round((item.actual / item.meta) * 100) : 0;
        const porcentaje = Math.max(0, Math.min(porcentajeRaw, 100));
        const [accent1, accent2] = getPdfMetricColors(item.key);
        const metaLabel = periodo === "mensual" ? "Meta mensual" : periodo === "hoy" ? "Meta diaria" : "Meta semanal";
        const actual = Math.round(item.actual || 0);
        const meta = Math.round(item.meta || 0);
        const unidad = escapeHtml(item.unidad || "");
        return `<article class="metric" style="--pct:${porcentaje}%; --accent1:${accent1}; --accent2:${accent2};">
          <div class="metric-left">
            <div>
              <div class="metric-title"><span class="metric-icon">${escapeHtml(item.icono)}</span><span>${escapeHtml(item.label)}</span></div>
              <div class="metric-values">
                <div class="metric-value-block"><div><span class="metric-number">${actual}</span><span class="metric-unit">${unidad}</span></div><div class="metric-label">Consumido</div></div>
                <div class="metric-value-block"><div><span class="metric-number">${meta}</span><span class="metric-unit">${unidad}</span></div><div class="metric-label">${metaLabel}</div></div>
              </div>
            </div>
            <div class="metric-progress-row"><span class="metric-progress-icon">↗</span><span class="metric-progress-label">Progreso</span><span class="metric-progress-value">${porcentajeRaw}%</span></div>
          </div>
          <div class="metric-meter-wrap"><div class="metric-meter"><div class="metric-meter-fill"></div></div><div class="metric-scale"><span>100%</span><span>50%</span><span>0%</span></div></div>
        </article>`;
      }).join("")}</div>`;

    const buildDateCell = (fechaKey) => {
      const d = parseDateFromKey(fechaKey);
      const dow = d.toLocaleDateString("es-ES", { weekday: "short" }).replace('.', '').toUpperCase();
      const mon = d.toLocaleDateString("es-ES", { month: "short" }).replace('.', '').toUpperCase();
      const day = String(d.getDate()).padStart(2, '0');
      return `<div class="daily-date">${dow},<small>${day}<br/>${mon}</small></div>`;
    };

    const buildDailyCell = (actual, meta, unidad) => `<div class="daily-cell"><div class="daily-actual">${Math.round(actual || 0)}${escapeHtml(unidad)}</div><div class="daily-meta">${Math.round(meta || 0)}${escapeHtml(unidad)}</div></div>`;

    const buildDailyBlocks = () => {
      const diasCerradosSemana = dailyWeekSnapshots.filter((row) => row?.diaFinalizado).slice(0, 7);
      if (!diasCerradosSemana.length) {
        return `<div class="daily-empty">Aún no hay días cerrados en esta semana.</div>`;
      }
      const header = `<div class="daily-head"><div class="daily-header-row"><div class="daily-header-cell"><span>🗓️</span>FECHA</div><div class="daily-header-cell"><span>🔥</span>KCAL</div><div class="daily-header-cell"><span>🥩</span>PROT</div><div class="daily-header-cell"><span>🍞</span>CARBS</div><div class="daily-header-cell"><span>🥑</span>GRASAS</div><div class="daily-header-cell"><span>🌿</span>FIBRA</div><div class="daily-header-cell"><span>💧</span>AGUA</div></div></div>`;
      const blocks = diasCerradosSemana.map((row) => {
        const note = row.hayCambioMetas ? `<div class="daily-combined-note">⚠️ 🔀 Metas combinadas</div>` : '';
        return `<div class="daily-block"><div class="daily-row"><div>${buildDateCell(row.fechaKey)}</div>${buildDailyCell(row.totales.kcal, row.metaEfectiva.kcal, '')}${buildDailyCell(row.totales.prot, row.metaEfectiva.prot, 'g')}${buildDailyCell(row.totales.carb, row.metaEfectiva.carb, 'g')}${buildDailyCell(row.totales.gras, row.metaEfectiva.gras, 'g')}${buildDailyCell(row.totales.fibr, row.metaEfectiva.fibr, 'g')}${buildDailyCell(row.totales.agua, row.metaEfectiva.agua, 'ml')}</div>${note}</div>`;
      }).join('');
      return `<div class="daily-shell">${header}<div class="daily-scroll">${blocks}</div></div>`;
    };

    let tituloExportacion = "Resumen"; let contenido = "";
    if (tipo === "hoy") { tituloExportacion = "Tu Progreso de Hoy"; contenido = `${buildMetricCards(itemsProgreso, "hoy")}`; }
    else if (tipo === "diario") { tituloExportacion = "Resumen Diario"; contenido = buildDailyBlocks(); }
    else if (tipo === "semanal") { tituloExportacion = "Resumen Semanal"; contenido = `${buildMetricCards(resumenSemanalItems, "semanal")}`; }
    else if (tipo === "mensual") { tituloExportacion = "Resumen Mensual"; contenido = `${buildMetricCards(resumenMensualItems, "mensual")}`; }
    const htmlDoc = buildPdfHtml({ tituloExportacion, contenido });
    setPdfPreview({ html: htmlDoc, titulo: tituloExportacion, fechaKey: tipo === "diario" ? fechaReporteDiarioKey : fechaHoyKey });
    setVistaActual("pdf");
    setMenuDatosAbierto(false);
    if (abrirPreview) setHistorialVista("preview");
  }

  async function compartirOCopiarSugerenciaTexto() {
    const nombreIngesta = objetivoSugerencia?.label || "ingesta";
    const texto = [`Hola, soy ${nombreUsuario}.`, fechaBonita, `Quiero llegar a estos valores nutricionales para ${nombreIngesta} con los ingredientes que tengo:`, ...datosSugerencia.map((item) => `${item.icono} ${item.titulo}: ${item.valor} ${item.unidad}`)].join("\n");
    try {
      const textarea = document.createElement("textarea"); textarea.value = texto; textarea.style.position = "fixed"; textarea.style.top = "0"; textarea.style.left = "0"; textarea.style.opacity = "0"; document.body.appendChild(textarea);
      textarea.focus(); textarea.select(); const exitoso = document.execCommand("copy"); document.body.removeChild(textarea);
      if (exitoso) setMensaje("✅ Copiado al portapapeles"); else setMensaje("❌ No se pudo copiar el texto");
    } catch (error) { setMensaje("❌ Error al intentar copiar"); }
  }

  const renderBloqueSugerencia = () => (
    <section style={styles.sugerenciaCard}>
      {!diaFinalizado && !diaCompleto ? (
        <button type="button" data-capture-ignore="true" style={styles.btnCapturaEmojiFloating} onClick={compartirOCopiarSugerenciaTexto} aria-label="Enviar sugerencia en texto" title="Enviar sugerencia en texto">
          <span style={styles.btnCapturaEmojiIcon}>📤</span>
        </button>
      ) : null}
      
      {!diaFinalizado && !diaCompleto ? (
        <div data-capture-ignore="true" style={styles.headerFocusFloating}><span style={styles.sugerenciaEmoji}>💡</span></div>
      ) : null}

      {!diaFinalizado && !diaCompleto ? (
        <div data-capture-ignore="true" style={styles.headerSaveFloating} ref={menuDatosRef}>
          <button type="button" style={styles.btnTresPuntosCard} onClick={() => setMenuDatosAbierto((prev) => !prev)}>
            ⋮
          </button>
        </div>
      ) : null}

      {menuDatosAbierto && !diaFinalizado ? (
        <>
          <div style={styles.menuDatosBackdrop} onClick={() => setMenuDatosAbierto(false)} />
          <div style={styles.menuDatosModalWrap}>
            <div style={styles.menuDatosCard} ref={menuDatosRef}>
              <div style={styles.menuDatosTitulo}>Opciones del día</div>
              <div style={styles.menuDatosSubtitulo}>Elige qué deseas hacer ahora</div>

              <button
                type="button"
                style={styles.menuDatosOption}
                onClick={() => {
                  setVistaActual("modificar");
                  setModoLectura(false);
                  setMenuDatosAbierto(false);
                }}
              >
                <span style={styles.menuDatosOptionMain}>📋 Ver / Modificar Registros</span>
                <span style={styles.menuDatosOptionSub}>Revisa o corrige tus datos antes de guardar</span>
              </button>

              <button
                type="button"
                style={styles.menuDatosOption}
                onClick={() => {
                  setVistaActual("progreso");
                  setMenuDatosAbierto(false);
                }}
              >
                <span style={styles.menuDatosOptionMain}>📊 Mi Progreso de Hoy</span>
                <span style={styles.menuDatosOptionSub}>Consulta el avance visual del día</span>
              </button>

              <button
                type="button"
                style={styles.menuDatosOption}
                onClick={() => {
                  setVistaActual("pdf");
                  setHistorialVista("menu");
                  setMenuDatosAbierto(false);
                }}
              >
                <span style={styles.menuDatosOptionMain}>📄 Descargar Resúmenes</span>
                <span style={styles.menuDatosOptionSub}>Abre tus reportes y PDFs</span>
              </button>

              <button
                type="button"
                style={styles.menuDatosOption}
                onClick={() => {
                  abrirModalMetas();
                  setMenuDatosAbierto(false);
                }}
              >
                <span style={styles.menuDatosOptionMain}>🎯 Cambiar mis Metas</span>
                <span style={styles.menuDatosOptionSub}>Ajusta tus metas del día</span>
              </button>

              <button
                type="button"
                style={styles.menuDatosOption}
                onClick={exportarRespaldoDatos}
              >
                <span style={styles.menuDatosOptionMain}>📤 Exportar respaldo</span>
                <span style={styles.menuDatosOptionSub}>Guarda una copia de tus datos en este teléfono</span>
              </button>

              <button
                type="button"
                style={styles.menuDatosOption}
                onClick={abrirImportarRespaldoDatos}
              >
                <span style={styles.menuDatosOptionMain}>📥 Importar respaldo</span>
                <span style={styles.menuDatosOptionSub}>Restaura tus datos desde un archivo guardado</span>
              </button>

              <div style={styles.menuDatosDivider} />

              <button
                type="button"
                style={{ ...styles.menuDatosOption, ...styles.menuDatosOptionSave }}
                onClick={() => {
                  confirmarFinalizarDia();
                  setMenuDatosAbierto(false);
                }}
              >
                <span style={styles.menuDatosOptionMain}>💾 Guardar y Cerrar Día</span>
                <span style={styles.menuDatosOptionSub}>Cierra el día y pasa a consulta final</span>
              </button>
            </div>
          </div>
        </>
      ) : null}

      <div style={styles.sugerenciaCaptureArea}>
        <div style={diaFinalizado || diaCompleto ? styles.headerTextCenter : styles.headerTextSugerencia}>
          <span style={styles.headerMainText}>
            {diaFinalizado ? "" : diaCompleto ? "" : `SUGERENCIA PARA: ${objetivoSugerencia.icono} ${objetivoSugerencia.label.toUpperCase()}`}
          </span>
        </div>
{modoPostGuardado || diaFinalizado ? (
  <div style={{ textAlign: "center", padding: "8px 0 2px" }}>
    <div style={{
      fontSize: "1.25rem",
      fontWeight: 800,
      marginBottom: "8px",
      color: "#dfe7f3"
    }}>
      ✅ Día guardado
    </div>

    <div style={{
      color: "#cfd6e6",
      fontWeight: 700,
      fontSize: "0.95rem",
      lineHeight: 1.35,
      textAlign: "center",
      marginBottom: "18px"
    }}>
      Tu día fue registrado correctamente.<br />
      💾 Los datos están guardados.
    </div>

    <div style={{ display: "grid", gap: "12px", marginTop: "18px" }}>
      <button
        type="button"
        style={styles.botonPanelFinal}
        onClick={() => {
          setVistaActual("pdf");
          setHistorialVista("menu");
        }}
      >
        📊 Ver informes
      </button>

      <button
        type="button"
        style={styles.botonPanelFinal}
        onClick={() => {
          setVistaActual("modificar");
          setModoLectura(true);
        }}
      >
        📋 Ver registros de hoy
      </button>

      <button
        type="button"
        style={styles.botonPanelFinal}
        onClick={exportarRespaldoDatos}
      >
        📤 Exportar respaldo
      </button>

      <button
        type="button"
        style={styles.botonPanelFinal}
        onClick={abrirImportarRespaldoDatos}
      >
        📥 Importar respaldo
      </button>
    </div>
  </div>
 ) : diaCompleto ? (
  mostrarControlCierre && !homeActualizadaActiva ? (
    <div style={styles.avisoCompletoWrap}>
      <div style={styles.avisoCompletoTitulo}>✅ INGESTAS COMPLETAS</div>

      <div style={styles.avisoCompletoDetalle}>
        Tu día está listo.<br />
        Elige guardar o seguir revisando antes de cerrar.
      </div>

      <button
        type="button"
        style={{ ...styles.btnPrincipalAzul, marginTop: "14px" }}
        onClick={confirmarFinalizarDia}
      >
        💾 GUARDAR DÍA
      </button>

      <button
        type="button"
        style={{ ...styles.botonPanelFinal, marginTop: "12px" }}
        onClick={() => {
          setHomeActualizadaActiva(true);
          setMostrarControlCierre(false);
          setMenuDatosAbierto(false);
        }}
      >
        🔄 Seguir revisando / modificar
      </button>
    </div>
  ) : (
    <div style={styles.homeActualizadaWrap}>
      <div style={styles.homeActualizadaTopRow}>
        <div
          style={styles.homeActualizadaActionLeft}
          onClick={confirmarFinalizarDia}
        >
          <span style={styles.homeActualizadaEmoji}>💾</span>
          <span style={styles.homeActualizadaHint}>⬅️ Guardar día</span>
        </div>

        <div
          style={styles.homeActualizadaActionRight}
          onClick={() => setMenuDatosAbierto(true)}
        >
          <span style={styles.homeActualizadaHint}>Opciones ➡️</span>
          <span style={styles.homeActualizadaEmoji}>⋮</span>
        </div>
      </div>
    </div>
  )
) : (
  <>
    <div style={styles.sugerenciaGrid}>
      {datosSugerencia.map((item) => (
        <div key={item.titulo} style={styles.sugerenciaMiniCard}>
          <div style={styles.sugerenciaMiniTop}>
            <span style={styles.sugerenciaMiniIcon}>{item.icono}</span>
            <span style={styles.sugerenciaMiniTitle}>{item.titulo}</span>
          </div>
          <div style={{ ...styles.sugerenciaMiniValue, color: item.color }}>
            {item.valor}
            <span style={styles.sugerenciaMiniUnit}>{item.unidad}</span>
          </div>
          <div
            style={{
              ...styles.sugerenciaMiniLine,
              background: item.color,
              boxShadow: `0 0 10px ${item.color}`,
            }}
          />
        </div>
      ))}
    </div>
  </>
)}


      </div>
<div style={{ marginTop: "16px" }}>
  {!diaFinalizado && !diaCompleto ? (
    <>
      <button
        type="button"
        style={styles.btnPrincipalAzul}
        onClick={iniciarRegistroPrincipal}
      >
        ✍️ REGISTRAR {proximaComidaPrincipal?.toUpperCase()}
      </button>

      <div style={styles.botonesAtajosGrid}>
        <div style={styles.btnAtajo} onClick={iniciarRegistroAgua}>
          <div style={styles.btnAtajoIcono}>💧</div>
          <div style={styles.btnAtajoTexto}>AGUA</div>
        </div>

        <div
          style={{
            ...styles.btnAtajo,
            ...(atajoColacion.ghost ? styles.btnAtajoGhost : {}),
          }}
          onClick={iniciarRegistroColacion}
        >
          <div style={styles.btnAtajoIcono}>{atajoColacion.icono}</div>
          <div
            style={
              atajoColacion.ghost
                ? styles.btnAtajoTextoGhost
                : styles.btnAtajoTexto
            }
          >
            {atajoColacion.label}
          </div>
        </div>
      </div>
        </>
  ) : null}
</div>

</section>
);
  const renderRegistroDiario = () => (
    <section style={styles.card}>
      <button type="button" style={styles.homeTopBtn} onClick={goHome} aria-label="Volver a inicio">🏠</button>
      <div style={styles.headerRegistroCenter}><span style={styles.registroEmoji}>✍️</span><span style={styles.headerMainText}>{modoLectura ? "REGISTRO DIARIO · SOLO LECTURA" : "REGISTRO DIARIO"}</span></div>

      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "12px", background: "#171a24", border: "1px solid #2e3240", borderRadius: "20px", padding: "16px", marginBottom: "18px", boxShadow: "0 8px 16px rgba(0,0,0,0.2)" }}>
        <span style={{ fontSize: "2rem", lineHeight: 1 }}>{actual.icono}</span>
        <span style={{ color: "#ffffff", fontSize: "1.4rem", fontWeight: 900, letterSpacing: "0.5px" }}>{actual.label.toUpperCase()}</span>
      </div>

      <div style={styles.gridRegistro}>
        <Campo label="KCAL" icono="🔥" unidad="kcal" valor={campos.kcal} onChange={(v) => handleCampoChange("kcal", v)} disabled={modoLectura} />
        <Campo label="PROT" icono="🥩" unidad="gr" valor={campos.prot} onChange={(v) => handleCampoChange("prot", v)} disabled={modoLectura} />
        <Campo label="CARB" icono="🍞" unidad="gr" valor={campos.carb} onChange={(v) => handleCampoChange("carb", v)} disabled={modoLectura} />
        <Campo label="GRAS" icono="🥑" unidad="gr" valor={campos.gras} onChange={(v) => handleCampoChange("gras", v)} disabled={modoLectura} />
        <Campo label="FIBR" icono="🌿" unidad="gr" valor={campos.fibr} onChange={(v) => handleCampoChange("fibr", v)} disabled={modoLectura} />
        <Campo label="AGUA" icono="💧" unidad="ml" valor={campos.agua} onChange={(v) => handleCampoChange("agua", v)} disabled={modoLectura} />
      </div>
      
      {!modoLectura ? (
        <>
          <button style={styles.btnPrincipalAzul} onClick={solicitarGuardarRegistro}>GUARDAR DATOS</button>
          <button style={styles.btnSecundarioOmitir} onClick={solicitarOmitirRegistro}>🚫 Omitir esta ingesta</button>
        </>
      ) : (
        <div style={styles.registrosAyuda}>Modo lectura: este día ya fue guardado.</div>
      )}
    </section>
  );

  const renderTusRegistros = () => (
    <section style={styles.cardProgresoContainer}>
      <button type="button" style={styles.homeTopBtnProgreso} onClick={goHome} aria-label="Volver a inicio">🏠</button>
      
      <div style={styles.headerProgresoHoy}>
        <div style={styles.headerProgresoHoyTitulo}>{"📋 TUS REGISTROS"}</div>
        <div style={styles.headerProgresoHoyFecha}>{fechaBonita}</div>
        <div style={{ color: "#8f96a4", fontSize: "0.85rem", marginTop: "8px", fontWeight: 700 }}>
          {modoLectura ? "Este día ya fue guardado. Puedes revisar los datos, pero no modificarlos." : "Selecciona un registro para editar o eliminar."}
        </div>
      </div>

      {registrosIngresados.length > 0 ? (
        <div className="historial-scroll-rows" style={styles.progresoScrollBox}>
          <div style={styles.gridProgresoInterno}>
            {registrosIngresados.map((item, index) => {
              const isEven = index % 2 === 0;
              const cardBg = isEven ? "#0a0d16" : "#121622";
              
              return (
              <div key={item.key} style={{...styles.registroCardPremium, background: cardBg, cursor: modoLectura ? "default" : "pointer", opacity: modoLectura ? 0.92 : 1}} onClick={() => { if (!modoLectura) abrirEditorRegistro(item); }}>
                <div style={styles.registroCardTop}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", width: "100%" }}>
                    <span style={{fontSize: "1.25rem"}}>{item.icono}</span>
                    <span style={styles.registroCardTitle}>{item.label}</span>
                  </div>
                  <span style={{ position: "absolute", right: 0, color: "#8d94a3", fontSize: "1.4rem" }}>›</span>
                </div>
                
                {item.registro._resueltaEnCero ? (
                   <div style={{color: "#8f96a4", fontStyle: "italic", textAlign: "center", padding: "12px 0", fontSize:"0.9rem"}}>Marcada en cero / sin ingesta</div>
                ) : item.resumen === "Sin datos" ? (
                   <div style={{color: "#8f96a4", textAlign: "center", padding: "12px 0", fontSize:"0.9rem"}}>Sin datos</div>
                ) : item.tipo === "agua" ? (
                  <div style={{ padding: "10px 0" }}>
                    <div style={{...styles.registroBadge, color: COLORES.agua, borderColor: "rgba(103,216,255,0.3)", background: "rgba(103,216,255,0.08)", padding: "16px", flexDirection: "row", gap: "12px", width: "100%"}}>
                      <div style={{fontSize: "2rem"}}>💧</div>
                      <div style={{fontWeight: 900, fontSize: "1.4rem"}}>{Math.round(item.registro.agua)} ml</div>
                    </div>
                  </div>
                ) : (
                  <div style={styles.registroBadgesGrid}>
                    <div style={{...styles.registroBadge, color: COLORES.kcal, borderColor: "rgba(255,122,112,0.15)", background: "rgba(255,122,112,0.05)"}}>
                      <div style={{fontSize: "1.1rem", marginBottom:"4px"}}>🔥</div>
                      <div style={{fontWeight: 900, fontSize: "0.85rem"}}>{Math.round(item.registro.kcal)}</div>
                    </div>
                    <div style={{...styles.registroBadge, color: COLORES.prot, borderColor: "rgba(255,95,168,0.15)", background: "rgba(255,95,168,0.05)"}}>
                      <div style={{fontSize: "1.1rem", marginBottom:"4px"}}>🥩</div>
                      <div style={{fontWeight: 900, fontSize: "0.85rem"}}>{Math.round(item.registro.prot)}g</div>
                    </div>
                    <div style={{...styles.registroBadge, color: COLORES.carb, borderColor: "rgba(244,163,64,0.15)", background: "rgba(244,163,64,0.05)"}}>
                      <div style={{fontSize: "1.1rem", marginBottom:"4px"}}>🍞</div>
                      <div style={{fontWeight: 900, fontSize: "0.85rem"}}>{Math.round(item.registro.carb)}g</div>
                    </div>
                    <div style={{...styles.registroBadge, color: COLORES.gras, borderColor: "rgba(54,223,104,0.15)", background: "rgba(54,223,104,0.05)"}}>
                      <div style={{fontSize: "1.1rem", marginBottom:"4px"}}>🥑</div>
                      <div style={{fontWeight: 900, fontSize: "0.85rem"}}>{Math.round(item.registro.gras)}g</div>
                    </div>
                    <div style={{...styles.registroBadge, color: COLORES.fibr, borderColor: "rgba(193,109,255,0.15)", background: "rgba(193,109,255,0.05)"}}>
                      <div style={{fontSize: "1.1rem", marginBottom:"4px"}}>🌿</div>
                      <div style={{fontWeight: 900, fontSize: "0.85rem"}}>{Math.round(item.registro.fibr)}g</div>
                    </div>
                    <div style={{...styles.registroBadge, color: COLORES.agua, borderColor: "rgba(103,216,255,0.15)", background: "rgba(103,216,255,0.05)"}}>
                      <div style={{fontSize: "1.1rem", marginBottom:"4px"}}>💧</div>
                      <div style={{fontWeight: 900, fontSize: "0.85rem"}}>{Math.round(item.registro.agua)}ml</div>
                    </div>
                  </div>
                )}
              </div>
            )})}
          </div>
        </div>
      ) : (
        <div style={styles.registrosAyuda}>Primero registra una ingesta para poder verla aquí.</div>
      )}
    </section>
  );

  const renderPDF = () => {
    if (historialVista === "semanal") {
      return (
        <section style={styles.resumenSemanalSinMarcoExterno}>
          <div style={styles.headerProgresoHoy}>
            <div style={styles.headerResumenSemanalUnaLinea}>📊 RESUMEN SEMANAL</div>
            <div style={styles.headerProgresoHoyFecha}>{rangoSemanaPreview}</div>
          </div>

          <div style={styles.botonesMenuGridPreview}>
            <button
              type="button"
              style={styles.btnMenuSecundario}
              onClick={() => {
                setPdfPreview(null);
                setHistorialVista("menu");
                setVistaActual("pdf");
              }}
            >
              ↩️ RESÚMENES
            </button>
            <button type="button" style={styles.btnMenuSecundario} onClick={goHome}>
              🏠 HOME
            </button>
            <button type="button" style={styles.btnMenuSecundario} onClick={() => exportarResumen("semanal")}>
              📄 COMPARTIR PDF
            </button>
          </div>

          <div style={styles.subheaderResumenSemana}>
            📈 PROGRESO SEMANAL POR NUTRIENTE
          </div>

          <div style={styles.espacioAvisoMetasCombinadasSemana}>
            {hayCambioMetasSemana ? (
              <MetasCombinadasAviso texto="Durante la semana se modificaron las metas. La comparación se calcula con la meta efectiva de cada día para reflejar el avance real." />
            ) : null}
          </div>

          <div className="historial-scroll-rows" style={styles.progresoSemanalScrollBox}>
            <div style={styles.gridProgresoInterno}>
              {resumenSemanalItems.map((item) => (
                <IndicadorProgreso key={item.key} {...item} esCombinada={hayCambioMetasSemana} diaFinalizado={true} resumenPlano />
              ))}
            </div>
          </div>

          <div style={styles.notaResumenSemana}>
            <div style={styles.notaResumenSemanaTexto}>
              <span style={styles.notaResumenSemanaEtiqueta}>NOTA:</span> Aquí ves el avance real de la semana por nutriente. La barra compara lo consumido contra la meta total semanal construida con la meta efectiva de cada día.
            </div>
          </div>
        </section>
      );
    }

    if (historialVista === "mensual") {
      const hayCambioMetasMes = monthSnapshots.some((item) => item?.hayCambioMetas);
      return (
        <section style={styles.resumenSemanalSinMarcoExterno}>
          <div style={styles.headerProgresoHoy}>
            <div style={styles.headerResumenSemanalUnaLinea}>📊 RESUMEN MENSUAL</div>
            <div style={styles.headerProgresoHoyFecha}>{formatMesHistorialTexto(fechaBaseHoy)}</div>
          </div>

          <div style={styles.botonesMenuGridPreview}>
            <button
              type="button"
              style={styles.btnMenuSecundario}
              onClick={() => {
                setPdfPreview(null);
                setHistorialVista("menu");
                setVistaActual("pdf");
              }}
            >
              ↩️ RESÚMENES
            </button>
            <button type="button" style={styles.btnMenuSecundario} onClick={goHome}>
              🏠 HOME
            </button>
            <button type="button" style={styles.btnMenuSecundario} onClick={() => exportarResumen("mensual")}>
              📄 COMPARTIR PDF
            </button>
          </div>

          <div style={styles.subheaderResumenSemana}>
            📈 PROGRESO MENSUAL POR NUTRIENTE
          </div>

          <div style={styles.espacioAvisoMetasCombinadasSemana}>
            {hayCambioMetasMes ? (
              <MetasCombinadasAviso texto="Durante el mes se modificaron las metas. La comparación se calcula con la meta efectiva de cada día para reflejar el avance real." />
            ) : null}
          </div>

          <div className="historial-scroll-rows" style={styles.progresoSemanalScrollBox}>
            <div style={styles.gridProgresoInterno}>
              {resumenMensualItems.map((item) => (
                <IndicadorProgreso key={item.key} {...item} esCombinada={hayCambioMetasMes} diaFinalizado={true} resumenPlano />
              ))}
            </div>
          </div>

          <div style={styles.notaResumenSemana}>
            <div style={styles.notaResumenSemanaTexto}>
              <span style={styles.notaResumenSemanaEtiqueta}>NOTA:</span> Aquí ves el avance real del mes por nutriente. La barra compara lo consumido contra la meta total mensual construida con la meta efectiva de cada día.
            </div>
          </div>
        </section>
      );
    }

    if (historialVista === "diario") {
      const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 430;
      const previewEsMovil = viewportWidth <= 430;
      const columnasResumenDiario = previewEsMovil
        ? "72px repeat(6, minmax(0, 1fr))"
        : "88px repeat(6, minmax(0, 1fr))";
      const fontPct = previewEsMovil ? "0.72rem" : "0.82rem";
      const fontMeta = previewEsMovil ? "0.52rem" : "0.60rem";
      const fontFecha = previewEsMovil ? "0.56rem" : "0.66rem";
      const filasResumen = resumenDiarioSemanaCerrados;
      const getPctTexto = (actual, meta) => {
        const metaNum = Number(meta || 0);
        if (metaNum <= 0) return "0%";
        return `${Math.round((Number(actual || 0) / metaNum) * 100)}%`;
      };

      return (
        <section
          style={{
            width: "100%",
            maxWidth: previewEsMovil ? "430px" : "500px",
            margin: "-10px auto 18px",
            padding: previewEsMovil ? "2px 6px 10px" : "4px 8px 12px",
            boxSizing: "border-box",
            overflow: "visible",
            background: "transparent",
            border: "none",
            borderRadius: 0,
            boxShadow: "none",
          }}
        >
          <div
            ref={resumenDiarioStickyRef}
            style={{
              position: "sticky",
              top: 0,
              zIndex: 4,
              background: "transparent",
              paddingBottom: "2px",
            }}
          >
            <div style={{ textAlign: "center", marginTop: "0px", marginBottom: "10px" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "42px minmax(0, 1fr) 42px",
                  alignItems: "center",
                  gap: previewEsMovil ? "6px" : "8px",
                  width: "100%",
                  maxWidth: "430px",
                  margin: "0 auto",
                }}
              >
                <button
                  type="button"
                  aria-label="Semana anterior"
                  title="Semana anterior"
                  style={{
                    border: "1px solid rgba(148,163,184,0.28)",
                    background: "rgba(15,23,42,0.72)",
                    color: "#ffffff",
                    borderRadius: "14px",
                    minHeight: "38px",
                    fontSize: "1.08rem",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                  onClick={() => moverReporteDiarioSemanas(-1)}
                >
                  ◀️
                </button>

                <button
                  type="button"
                  aria-label="Elegir semana"
                  title="Elegir semana"
                  style={{
                    border: "1px solid rgba(148,163,184,0.22)",
                    background: "rgba(15,23,42,0.46)",
                    color: "#e5e7eb",
                    borderRadius: "16px",
                    padding: previewEsMovil ? "8px 6px" : "9px 8px",
                    minHeight: "38px",
                    fontWeight: 900,
                    fontSize: previewEsMovil ? "0.78rem" : "0.9rem",
                    lineHeight: 1.16,
                    cursor: "pointer",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
                  }}
                  onClick={abrirSelectorSemanaDiario}
                >
                  📅 {rangoSemanaDiarioPreview}
                </button>

                <button
                  type="button"
                  aria-label="Semana siguiente"
                  title="Semana siguiente"
                  disabled={!puedeAvanzarReporteDiario}
                  style={{
                    border: "1px solid rgba(148,163,184,0.28)",
                    background: puedeAvanzarReporteDiario ? "rgba(15,23,42,0.72)" : "rgba(15,23,42,0.26)",
                    color: puedeAvanzarReporteDiario ? "#ffffff" : "#6b7280",
                    borderRadius: "14px",
                    minHeight: "38px",
                    fontSize: "1.08rem",
                    fontWeight: 900,
                    cursor: puedeAvanzarReporteDiario ? "pointer" : "not-allowed",
                    opacity: puedeAvanzarReporteDiario ? 1 : 0.58,
                  }}
                  onClick={() => {
                    if (puedeAvanzarReporteDiario) moverReporteDiarioSemanas(1);
                  }}
                >
                  ▶️
                </button>
              </div>

              {!reporteDiarioEsSemanaActual && (
                <button
                  type="button"
                  style={{
                    marginTop: "8px",
                    border: "1px solid rgba(125, 211, 252, 0.36)",
                    background: "rgba(14, 165, 233, 0.12)",
                    color: "#dbeafe",
                    borderRadius: "999px",
                    padding: "7px 14px",
                    fontSize: previewEsMovil ? "0.72rem" : "0.78rem",
                    fontWeight: 900,
                    cursor: "pointer",
                    boxShadow: "0 0 14px rgba(14, 165, 233, 0.10)",
                  }}
                  onClick={irReporteDiarioSemanaActual}
                >
                  <span style={{ color: "#7dd3fc", marginRight: "5px" }}>🔄</span>
                  Volver a semana actual
                </button>
              )}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: previewEsMovil ? "6px" : "8px",
                marginBottom: "10px",
              }}
            >
              <button
                type="button"
                style={{
                  ...styles.btnMenuSecundario,
                  minHeight: previewEsMovil ? "42px" : "44px",
                  fontSize: previewEsMovil ? "0.74rem" : "0.8rem",
                  padding: previewEsMovil ? "10px 4px" : "10px 6px",
                }}
                onClick={() => {
                  setPdfPreview(null);
                  setHistorialVista("menu");
                  setVistaActual("pdf");
                }}
              >
                ↩️ RESÚMENES
              </button>
              <button
                type="button"
                style={{
                  ...styles.btnMenuSecundario,
                  minHeight: previewEsMovil ? "42px" : "44px",
                  fontSize: previewEsMovil ? "0.74rem" : "0.8rem",
                  padding: previewEsMovil ? "10px 4px" : "10px 6px",
                }}
                onClick={goHome}
              >
                🏠 HOME
              </button>
              <button
                type="button"
                style={{
                  ...styles.btnMenuSecundario,
                  minHeight: previewEsMovil ? "42px" : "44px",
                  fontSize: previewEsMovil ? "0.74rem" : "0.8rem",
                  padding: previewEsMovil ? "10px 4px" : "10px 6px",
                }}
                onClick={() => exportarResumen("diario")}
              >
                📄 COMPARTIR PDF
              </button>
            </div>

            <div
              style={{
                background: "transparent",
                border: "none",
                borderRadius: 0,
                padding: previewEsMovil ? "8px 2px 10px" : "8px 4px 10px",
                marginBottom: "8px",
                overflow: "visible",
                boxSizing: "border-box",
                borderTop: "1px solid rgba(148,163,184,0.32)",
                borderBottom: "1px solid rgba(148,163,184,0.42)",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: columnasResumenDiario,
                  columnGap: 0,
                  alignItems: "center",
                  justifyItems: "stretch",
                  textAlign: "center",
                  width: "100%",
                  margin: "0 auto",
                }}
              >
                {[
                  ["🗓️", "FECHA"],
                  ["🔥", "KCAL"],
                  ["🥩", "PROT"],
                  ["🍞", "CARBS"],
                  ["🥑", "GRASAS"],
                  ["🌿", "FIBRA"],
                  ["💧", "AGUA"],
                ].map(([icono, label], idx) => (
                  <div
                    key={label}
                    style={{
                      color: "#ffffff",
                      fontWeight: 900,
                      fontSize: previewEsMovil ? "0.62rem" : "0.7rem",
                      lineHeight: 1.05,
                      textAlign: "center",
                      minWidth: 0,
                      width: "100%",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <div style={{ fontSize: previewEsMovil ? "0.98rem" : "1.12rem", marginBottom: "3px" }}>{icono}</div>
                    <div>{label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div
            style={{
              background: "transparent",
              border: "none",
              borderRadius: 0,
              padding: 0,
              marginBottom: 0,
              overflow: "visible",
              boxShadow: "none",
            }}
          >
            {filasResumen.length === 0 ? (
              <div
                style={{
                  background: "#0b1535",
                  border: "1px solid rgba(148,163,184,0.12)",
                  borderRadius: "12px",
                  margin: "10px",
                  padding: "24px 16px",
                  textAlign: "center",
                  color: "#cbd5e1",
                  fontWeight: 700,
                }}
              >
                Aún no hay días cerrados en esta semana.
              </div>
            ) : (
              <div
                ref={resumenDiarioRowsRef}
                className="historial-scroll-rows"
                style={{
                  height: `${resumenDiarioScrollHeight}px`,
                  overflowY: "auto",
                  WebkitOverflowScrolling: "touch",
                }}
              >
                <div ref={resumenDiarioRowsInnerRef} style={{ display: "grid", gap: 0, padding: 0, alignContent: "start" }}>
                {filasResumen.map((row, rowIndex) => {
                  const fechaDia = parseDateFromKey(row.fechaKey);
                  const dow = fechaDia.toLocaleDateString("es-ES", { weekday: "short" }).replace('.', '').toUpperCase();
                  const mon = fechaDia.toLocaleDateString("es-ES", { month: "short" }).replace('.', '').toUpperCase();
                  const day = String(fechaDia.getDate()).padStart(2, "0");
                  return (
                    <div
                      key={row.fechaKey}
                      data-resumen-row="1"
                      style={{
                        background: "transparent",
                        borderBottom: "1px solid rgba(148,163,184,0.34)",
                        padding: row.hayCambioMetas
                          ? previewEsMovil
                            ? "12px 8px 10px"
                            : "14px 10px 11px"
                          : previewEsMovil
                            ? "12px 8px"
                            : "14px 10px",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: columnasResumenDiario,
                          columnGap: 0,
                          alignItems: "center",
                          justifyItems: "stretch",
                          textAlign: "center",
                          width: "100%",
                          margin: "0 auto",
                        }}
                      >
                        <div
                          style={{
                            color: "#ffffff",
                            fontWeight: 800,
                            fontSize: fontFecha,
                            lineHeight: 1.02,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            textAlign: "center",
                            minWidth: 0,
                            width: "100%",
                          }}
                        >
                          <div>{dow},</div>
                          <div>{day}</div>
                          <div>{mon}</div>
                        </div>
                        {[
                          [row.totales.kcal, row.metaEfectiva.kcal, "kcal"],
                          [row.totales.prot, row.metaEfectiva.prot, "gr"],
                          [row.totales.carb, row.metaEfectiva.carb, "gr"],
                          [row.totales.gras, row.metaEfectiva.gras, "gr"],
                          [row.totales.fibr, row.metaEfectiva.fibr, "gr"],
                          [row.totales.agua, row.metaEfectiva.agua, "ml"],
                        ].map(([actual, meta, unidad], idx) => (
                          <div
                            key={idx}
                            style={{
                              minWidth: 0,
                              width: "100%",
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              justifyContent: "center",
                              textAlign: "center",
                            }}
                          >
                            <div
                              style={{
                                fontSize: fontPct,
                                fontWeight: 900,
                                color: "#ffffff",
                                lineHeight: 1.04,
                                whiteSpace: "nowrap",
                              }}
                            >
                              {getPctTexto(actual, meta)}
                            </div>
                            <div
                              style={{
                                fontSize: fontMeta,
                                fontWeight: 760,
                                color: "#a5b4cc",
                                marginTop: "4px",
                                lineHeight: 1.04,
                                whiteSpace: "nowrap",
                              }}
                            >
                              {Math.round(meta || 0)} {unidad}
                            </div>
                          </div>
                        ))}
                      </div>
                      {row.hayCambioMetas ? (
                        <MetasCombinadasAviso compacto />
                      ) : null}
                    </div>
                  );
                })}
                <div
                  ref={resumenDiarioNotaRef}
                  style={{
                    borderTop: "1px solid rgba(148,163,184,0.38)",
                    padding: previewEsMovil ? "10px 10px 10px" : "12px 12px 12px",
                    background: "transparent",
                  }}
                >
                  <div style={{ color: "#e5e7eb", fontWeight: 900, fontSize: previewEsMovil ? "0.72rem" : "0.78rem", marginBottom: "4px", textAlign: "center" }}>
                    NOTA
                  </div>
                  <div style={{ color: "#a5b4cc", fontSize: previewEsMovil ? "0.58rem" : "0.64rem", lineHeight: 1.28, textAlign: "center" }}>
                    Arriba ves el porcentaje y abajo la meta del día cerrado. Desliza para acercar el último día al cabezal.
                  </div>
                </div>
                <div
                  aria-hidden="true"
                  style={{
                    height: `${resumenDiarioParkingHeight}px`,
                    background: "transparent",
                  }}
                />
                </div>
              </div>
            )}
          </div>
        </section>
      );
    }

    if (historialVista === "preview" && pdfPreview) {
      return (
        <section style={styles.previewPdfShell}>
          <div style={styles.previewPdfTopActions}>
            <button
              type="button"
              style={styles.previewPdfBackBtn}
              onClick={() => {
                if (pdfPreview?.titulo === "Resumen Diario") setHistorialVista("diario");
                else if (pdfPreview?.titulo === "Resumen Semanal") setHistorialVista("semanal");
                else if (pdfPreview?.titulo === "Resumen Mensual") setHistorialVista("mensual");
                else setHistorialVista("menu");
              }}
            >
              ↩️ RESÚMENES
            </button>
            <button type="button" style={styles.previewPdfPrintBtn} onClick={compartirPreviewActual}>📄 COMPARTIR PDF</button>
          </div>
          <div style={styles.previewPdfFrameWrap}><iframe ref={previewFrameRef} title={pdfPreview.titulo} srcDoc={pdfPreview.html} style={styles.previewPdfFrame} /></div>
        </section>
      );
    }
    return (
      <section style={styles.cardRegistros}>
        <button type="button" style={styles.homeTopBtn} onClick={goHome} aria-label="Volver a inicio">🏠</button>
        <div style={styles.headerTusRegistros}><span style={styles.emojiTusRegistros}>📄</span><span style={styles.tituloTusRegistros}>HISTORIAL</span></div>
        <div style={styles.botonesMenuGrid}>
          <button type="button" style={styles.btnMenuSecundario} onClick={() => { setVistaActual("pdf"); setHistorialVista("diario"); setPdfPreview(null); }}>DIARIO</button>
          <button type="button" style={styles.btnMenuSecundario} onClick={() => { setVistaActual("pdf"); setHistorialVista("semanal"); setPdfPreview(null); }}>SEMANAL</button>
          <button type="button" style={styles.btnMenuSecundario} onClick={() => { setVistaActual("pdf"); setHistorialVista("mensual"); setPdfPreview(null); }}>MENSUAL</button>
        </div>
      </section>
    );
  };

  if (!setupInicialCompleto) {
    if (mostrarIntroSetup) {
      return (
        <div style={styles.app}>
          {inputRespaldoOculto}
          <div style={{
            ...styles.screen,
            justifyContent: "center",
            minHeight: "100vh",
            background:
              "radial-gradient(circle at 50% 10%, rgba(59, 130, 246, 0.18) 0%, rgba(8, 13, 28, 0.96) 38%, #050713 100%)",
          }}>
            <section style={{
              width: "100%",
              maxWidth: "390px",
              margin: "0 auto",
              padding: "34px 22px 30px",
              borderRadius: "32px",
              border: "1px solid rgba(255,255,255,0.08)",
              background:
                "linear-gradient(180deg, rgba(17, 24, 39, 0.88) 0%, rgba(5, 8, 20, 0.96) 100%)",
              boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
              textAlign: "center",
              position: "relative",
              overflow: "hidden",
            }}>
              <div style={{
                position: "absolute",
                inset: "-80px -60px auto auto",
                width: "170px",
                height: "170px",
                borderRadius: "999px",
                background: "rgba(34, 197, 94, 0.12)",
                filter: "blur(2px)",
              }} />
              <div style={{
                position: "absolute",
                left: "-60px",
                bottom: "-70px",
                width: "160px",
                height: "160px",
                borderRadius: "999px",
                background: "rgba(59, 130, 246, 0.12)",
                filter: "blur(2px)",
              }} />
              <div style={{ position: "relative", zIndex: 1 }}>
                <div style={{ fontSize: "3.2rem", marginBottom: "16px", lineHeight: 1 }}>👋</div>
                <div style={{
                  color: "#ffffff",
                  fontWeight: 950,
                  fontSize: "1.75rem",
                  letterSpacing: "0.04em",
                  lineHeight: 1.12,
                  marginBottom: "10px",
                  textTransform: "uppercase",
                }}>
                  CONTROL<br />NUTRICIONAL
                </div>
                <div style={{
                  color: "#b9c3d7",
                  fontWeight: 750,
                  fontSize: "0.98rem",
                  lineHeight: 1.35,
                  marginBottom: "32px",
                }}>
                  Tu progreso diario,<br />bajo control
                </div>
                <button
                  type="button"
                  onClick={() => setMostrarIntroSetup(false)}
                  style={{
                    border: "1px solid rgba(143,216,87,0.65)",
                    borderRadius: "999px",
                    padding: "11px 22px",
                    background: "rgba(26, 42, 16, 0.78)",
                    color: "#f8fff2",
                    fontWeight: 900,
                    fontSize: "0.88rem",
                    letterSpacing: "0.04em",
                    boxShadow: "0 0 18px rgba(143,216,87,0.16)",
                    cursor: "pointer",
                  }}
                >
                  ⚙️ CONFIGURAR
                </button>

                <div style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "10px",
                  marginTop: "18px",
                }}>
                  <button
                    type="button"
                    onClick={exportarRespaldoDatos}
                    style={{
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: "14px",
                      padding: "10px 8px",
                      background: "rgba(3,6,13,0.46)",
                      color: "#e8eefb",
                      fontWeight: 850,
                      fontSize: "0.78rem",
                      cursor: "pointer",
                    }}
                  >
                    📤 Exportar
                  </button>
                  <button
                    type="button"
                    onClick={abrirImportarRespaldoDatos}
                    style={{
                      border: "1px solid rgba(143,216,87,0.45)",
                      borderRadius: "14px",
                      padding: "10px 8px",
                      background: "rgba(26,42,16,0.38)",
                      color: "#f8fff2",
                      fontWeight: 850,
                      fontSize: "0.78rem",
                      cursor: "pointer",
                    }}
                  >
                    📥 Importar
                  </button>
                </div>
              </div>
            </section>
          </div>
        </div>
      );
    }

    return (
      <div style={styles.app}>
        {inputRespaldoOculto}
        <div style={{ ...styles.screen, paddingTop: "18px" }}>
          <section style={{
            ...styles.card,
            maxWidth: "820px",
            margin: "0 auto",
            padding: "22px 18px 26px",
            background: "linear-gradient(180deg, #101827 0%, #080d1c 100%)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}>
            <div style={{ textAlign: "center", marginBottom: "18px" }}>
              <div style={{ fontSize: "2.25rem", marginBottom: "8px" }}>👋</div>
              <div style={{
                color: "#ffffff",
                fontWeight: 950,
                fontSize: "1.48rem",
                marginBottom: "6px",
                letterSpacing: "0.03em",
                textTransform: "uppercase",
              }}>
                CONTROL NUTRICIONAL
              </div>
              <div style={{ color: "#c7cfdd", fontWeight: 750, fontSize: "0.95rem" }}>
                Configura tu perfil inicial
              </div>
            </div>

            <div style={{
              marginBottom: "16px",
              padding: "14px",
              borderRadius: "20px",
              background: "rgba(26,42,16,0.38)",
              border: "1px solid rgba(143,216,87,0.34)",
            }}>
              <div style={{ color: "#ffffff", fontWeight: 900, fontSize: "0.92rem", marginBottom: "6px" }}>
                📦 ¿Ya tienes un respaldo?
              </div>
              <div style={{ color: "#c7cfdd", fontWeight: 650, fontSize: "0.82rem", lineHeight: 1.35, marginBottom: "12px" }}>
                Importa aquí tus datos anteriores para no empezar desde cero.
              </div>
              <button
                type="button"
                style={{
                  width: "100%",
                  border: "1px solid rgba(143,216,87,0.48)",
                  borderRadius: "16px",
                  padding: "12px",
                  color: "#f8fff2",
                  fontWeight: 900,
                  fontSize: "0.9rem",
                  cursor: "pointer",
                  background: "rgba(26, 42, 16, 0.82)",
                }}
                onClick={abrirImportarRespaldoDatos}
              >
                📥 IMPORTAR RESPALDO
              </button>
            </div>

            <div style={{
              marginBottom: "16px",
              padding: "14px",
              borderRadius: "20px",
              background: "rgba(3,6,13,0.92)",
              border: "1px solid #1e2635",
              boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.015)",
            }}>
              <div style={{
                color: "#ffffff",
                fontWeight: 900,
                fontSize: "0.88rem",
                marginBottom: "10px",
                letterSpacing: "0.02em",
              }}>
                👤 ¿QUIÉN USARÁ LA APP?
              </div>
              <div style={{ ...styles.valorWrap, minHeight: "48px" }}>
                <input
                  type="text"
                  value={camposInicio.nombre}
                  onChange={(e) => handleCampoInicioChange("nombre", e.target.value)}
                  placeholder="Tu nombre"
                  style={{
                    ...styles.campoInput,
                    textAlign: "left",
                    paddingLeft: "14px",
                    fontSize: "1.05rem",
                    fontWeight: 800,
                  }}
                />
                <div style={styles.campoUnidad}>👤</div>
              </div>
            </div>

            <div style={{
              color: "#ffffff",
              fontWeight: 950,
              margin: "14px 0 14px",
              fontSize: "1.03rem",
              textAlign: "center",
              letterSpacing: "0.02em",
            }}>
              🎯 TUS METAS
            </div>
            <div style={styles.gridRegistro}>
              <Campo label="KCAL" icono="🔥" unidad="kcal" valor={camposInicio.kcal} onChange={(value) => handleCampoInicioChange("kcal", value)} />
              <Campo label="PROT" icono="🥩" unidad="gr" valor={camposInicio.prot} onChange={(value) => handleCampoInicioChange("prot", value)} />
              <Campo label="CARBS" icono="🍞" unidad="gr" valor={camposInicio.carb} onChange={(value) => handleCampoInicioChange("carb", value)} />
              <Campo label="GRASAS" icono="🥑" unidad="gr" valor={camposInicio.gras} onChange={(value) => handleCampoInicioChange("gras", value)} />
              <Campo label="FIBRA" icono="🌿" unidad="gr" valor={camposInicio.fibr} onChange={(value) => handleCampoInicioChange("fibr", value)} />
              <Campo label="AGUA" icono="💧" unidad="ml" valor={camposInicio.agua} onChange={(value) => handleCampoInicioChange("agua", value)} />
            </div>

            <button
              type="button"
              style={{
                width: "100%",
                border: "none",
                borderRadius: "18px",
                padding: "16px",
                color: "#ffffff",
                fontWeight: 950,
                fontSize: "1.02rem",
                cursor: "pointer",
                background: "linear-gradient(180deg, #39d56f 0%, #159447 100%)",
                boxShadow: "0 12px 26px rgba(21,148,71,0.26)",
                marginTop: "18px",
              }}
              onClick={confirmarSetupInicial}
            >
              ✅ GUARDAR Y ENTRAR
            </button>
            {mensaje ? <div style={styles.mensaje}>{mensaje}</div> : null}
          </section>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.app}>
      {inputRespaldoOculto}
      <div style={styles.screen}>
        
        {vistaActual === "sugerencia" ? (
          <div style={{ textAlign: "center", marginTop: "10px", marginBottom: "20px" }}>
            <h1 style={{ fontSize: "clamp(1.8rem, 6.5vw, 2.4rem)", fontWeight: 900, margin: "0 0 6px 0", color: "#ffffff", lineHeight: 1.1 }}>
              {saludoTexto.texto}, {nombreUsuario}! <span style={{ display: "inline-block", textShadow: "0 0 18px rgba(255, 215, 0, 1), 0 0 35px rgba(255, 140, 0, 0.8)", transform: "translateY(2px)" }}>{saludoTexto.emoji}</span>
            </h1>
            <div style={styles.fecha}>{fechaBonita}</div>
          </div>
        ) : vistaActual === "progreso" || vistaActual === "modificar" || ocultarTituloSuperiorPdf ? null : (
          <h1 style={vistaActual === "pdf" ? styles.tituloPdf : styles.titulo}>{tituloPantalla}</h1>
        )}

        {mensaje ? (
          vistaActual === "sugerencia" || vistaActual === "registro" || vistaActual === "modificar" || vistaActual === "progreso"
            ? <div style={styles.mensajeToast}>{mensaje}</div>
            : <div style={styles.mensaje}>{mensaje}</div>
        ) : null}

        {vistaActual === "sugerencia" ? (
          <div ref={sugerenciaCaptureRef} style={styles.sugerenciaExportWrap}>
            {renderBloqueSugerencia()}
          </div>
        ) : null}

        {vistaActual !== "pdf" && vistaActual !== "progreso" && vistaActual !== "sugerencia" && vistaActual !== "modificar" ?
          (
          <div style={styles.bienvenida}><div style={styles.saludo}>¡Hola, {nombreUsuario}!</div><div style={styles.fecha}>{fechaBonita}</div></div>
        ) : null}

        {vistaActual === "registro" ? renderRegistroDiario() : null}
        {vistaActual === "modificar" ? renderTusRegistros() : null}
        
        {vistaActual === "progreso" ? (
          <section style={styles.cardProgresoContainer}>
            <button type="button" style={styles.homeTopBtnProgreso} onClick={goHome} aria-label="Volver a inicio">🏠</button>
            <div style={styles.headerProgresoHoy}>
              <div style={styles.headerProgresoHoyTitulo}>{"📊 TU PROGRESO\nDE HOY"}</div>
              <div style={styles.headerProgresoHoyFecha}>{fechaBonita}</div>
            </div>
            <div className="historial-scroll-rows" style={styles.progresoScrollBox}>
              <div style={styles.gridProgresoInterno}>
                 {/* 🔥 AQUÍ SE DIBUJAN LAS NUEVAS TARJETAS PREMIUM */}
                 {itemsProgreso.map((item) => <IndicadorProgreso key={item.key} {...item} esCombinada={hayCambioMetasHoy} />)}
              </div>
            </div>
                      </section>
        ) : null}

        {vistaActual === "pdf" ? renderPDF() : null}

        {modalRegistroAguaAbierto ? <ModalRegistroAgua valor={campos.agua} onChange={(v) => handleCampoChange("agua", v)} onGuardar={ejecutarGuardarAguaFlotante} onCancelar={() => { setModalRegistroAguaAbierto(false); resetCampos(); }} /> : null}

        {editorRegistroAbierto && registroActivo ? (
          <>
            <ModalEditarRegistro registroActivo={registroActivo} camposEdicion={camposEdicion} onChange={handleCampoEdicionChange} onActualizar={solicitarActualizarRegistroActivo} onCerrar={cerrarEditorRegistro} onBorrar={solicitarBorrarRegistroActivo} />
            {confirmacionEdicion ? <ModalConfirmacionEdicion confirmacionActiva={confirmacionEdicion} onConfirmar={confirmarAccionEdicion} onCancelar={() => setConfirmacionEdicion(null)} /> : null}
          </>
        ) : null}
        
        {modalConfirmacionIngesta ? <ModalConfirmacionIngesta info={modalConfirmacionIngesta} onConfirmar={ejecutarAccionIngesta} onCancelar={() => setModalConfirmacionIngesta(null)} /> : null}
        {promptColacionActiva ? <PromptColacionModal promptColacionActiva={promptColacionActiva} onRegistrar={() => irARegistrarColacion(promptColacionActiva.label)} onOmitir={() => resolverColacionEnCero(promptColacionActiva.label, promptColacionActiva.nextMain)} /> : null}
        {alertaDesayunoSaltado ? <AlertaDesayunoSaltadoModal onIrDesayuno={irADesayunoDesdeAlerta} onContinuarColacion={continuarAColacionDesdeAlerta} onCerrar={() => setAlertaDesayunoSaltado(false)} /> : null}
        
        {modalFinalizar ? <FinalizarDiaModal modalFinalizar={modalFinalizar} onCerrar={cerrarFinalizarDia} onConfirmar={confirmarFinalizarDia} /> : null}
        {modalMetasAbierto ? <ModalMetasDia camposMetas={camposMetas} onChange={handleCampoMetaChange} onConfirmar={confirmarCambioMetas} onCerrar={cerrarModalMetas} /> : null}
        {selectorSemanaDiarioAbierto ? (
          <ModalCalendarioSemanaReporte
            fechaValor={fechaSelectorDiario}
            fechaMaxima={formatDateKey(new Date())}
            onChange={aplicarFechaSelectorSemanaDiario}
            onConfirmar={confirmarSelectorSemanaDiario}
            onCerrar={cancelarSelectorSemanaDiario}
            onSemanaActual={seleccionarSemanaActualEnCalendarioDiario}
          />
        ) : null}
        {modalRescateAbierto ? <ModalRescateDia fechaKey={fechaHoyKey} onGuardar={ejecutarRescate} onDescartar={descartarRescate} /> : null}
      </div>
    </div>
  );
}


// ============================================================================
// 🧩 BLOQUE 5: COMPONENTES SECUNDARIOS Y MODALES
// ============================================================================

function ModalCalendarioSemanaReporte({ fechaValor, fechaMaxima, onChange, onConfirmar, onCerrar, onSemanaActual }) {
  const fechaSeleccionada = useMemo(() => {
    const parsed = parseDateFromKey(fechaValor || formatDateKey(new Date()));
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }, [fechaValor]);

  const fechaMaximaDate = useMemo(() => {
    const parsed = parseDateFromKey(fechaMaxima || formatDateKey(new Date()));
    return getStartOfDay(Number.isNaN(parsed.getTime()) ? new Date() : parsed);
  }, [fechaMaxima]);

  const [mesVisible, setMesVisible] = useState(() => new Date(fechaSeleccionada.getFullYear(), fechaSeleccionada.getMonth(), 1));

  useEffect(() => {
    setMesVisible(new Date(fechaSeleccionada.getFullYear(), fechaSeleccionada.getMonth(), 1));
  }, [fechaSeleccionada]);

  const diasSemana = ["L", "M", "M", "J", "V", "S", "D"];
  const monthLabel = mesVisible.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  const monthLabelFinal = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);
  const selectedKey = formatDateKey(fechaSeleccionada);
  const selectedWeekKey = formatDateKey(getStartOfWeek(fechaSeleccionada));
  const rangoSeleccionado = formatRangoHistorialTexto(fechaSeleccionada);

  const maxMonth = new Date(fechaMaximaDate.getFullYear(), fechaMaximaDate.getMonth(), 1);
  const puedeAvanzarMes = mesVisible.getTime() < maxMonth.getTime();

  const moverMes = (delta) => {
    setMesVisible((prev) => {
      const next = new Date(prev.getFullYear(), prev.getMonth() + delta, 1);
      if (next.getTime() > maxMonth.getTime()) return prev;
      return next;
    });
  };

  const irAHoyVisual = () => {
    const hoyKey = formatDateKey(new Date());
    onSemanaActual?.();
    const hoyDate = parseDateFromKey(hoyKey);
    setMesVisible(new Date(hoyDate.getFullYear(), hoyDate.getMonth(), 1));
  };

  const firstOfMonth = new Date(mesVisible.getFullYear(), mesVisible.getMonth(), 1);
  const offsetMonday = firstOfMonth.getDay() === 0 ? 6 : firstOfMonth.getDay() - 1;
  const startGrid = new Date(firstOfMonth);
  startGrid.setDate(firstOfMonth.getDate() - offsetMonday);
  const cells = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(startGrid);
    date.setDate(startGrid.getDate() + index);
    return date;
  });

  return (
    <div style={styles.modalOverlay}>
      <div
        style={{
          width: "min(92vw, 392px)",
          background: "linear-gradient(180deg, rgba(22,29,44,0.98) 0%, rgba(5,9,18,0.98) 100%)",
          border: "1px solid rgba(148,163,184,0.28)",
          borderRadius: "28px",
          padding: "20px 16px 16px",
          boxShadow: "0 32px 70px rgba(0,0,0,0.62), inset 0 1px 0 rgba(255,255,255,0.06)",
          animation: "scaleFadeIn 0.18s ease-out",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "14px" }}>
          <div style={{ color: "#ffffff", fontWeight: 950, fontSize: "1.32rem", letterSpacing: "0.01em", lineHeight: 1.08 }}>
            Resumen Diario
          </div>
          <div style={{ color: "#dbe5f7", fontWeight: 950, fontSize: "0.98rem", letterSpacing: "0.04em", marginTop: "7px", textTransform: "uppercase" }}>
            Elegir semana
          </div>
          <div style={{ color: "#91a0ba", fontWeight: 750, fontSize: "0.78rem", lineHeight: 1.35, marginTop: "10px" }}>
            Toca cualquier día para resaltar su semana completa.
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "44px minmax(0, 1fr) 44px", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
          <button
            type="button"
            onClick={() => moverMes(-1)}
            style={{
              height: "42px",
              borderRadius: "14px",
              border: "1px solid rgba(148,163,184,0.25)",
              background: "rgba(15,23,42,0.72)",
              color: "#ffffff",
              fontSize: "1.22rem",
              fontWeight: 950,
              cursor: "pointer",
            }}
            aria-label="Mes anterior"
          >
            ‹
          </button>
          <div style={{ textAlign: "center", color: "#ffffff", fontSize: "1.05rem", fontWeight: 950, lineHeight: 1.1 }}>{monthLabelFinal}</div>
          <button
            type="button"
            onClick={() => moverMes(1)}
            disabled={!puedeAvanzarMes}
            style={{
              height: "42px",
              borderRadius: "14px",
              border: "1px solid rgba(148,163,184,0.25)",
              background: puedeAvanzarMes ? "rgba(15,23,42,0.72)" : "rgba(15,23,42,0.28)",
              color: puedeAvanzarMes ? "#ffffff" : "#64748b",
              fontSize: "1.22rem",
              fontWeight: 950,
              cursor: puedeAvanzarMes ? "pointer" : "not-allowed",
            }}
            aria-label="Mes siguiente"
          >
            ›
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "4px", marginBottom: "6px" }}>
          {diasSemana.map((dia, index) => (
            <div key={dia + index} style={{ textAlign: "center", color: "#98a2b3", fontWeight: 950, fontSize: "0.76rem", padding: "6px 0" }}>{dia}</div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "4px", marginBottom: "12px" }}>
          {cells.map((date) => {
            const key = formatDateKey(date);
            const sameMonth = date.getMonth() === mesVisible.getMonth();
            const disabled = getStartOfDay(date).getTime() > fechaMaximaDate.getTime();
            const selected = key === selectedKey;
            const inWeek = formatDateKey(getStartOfWeek(date)) === selectedWeekKey;
            return (
              <button
                key={key}
                type="button"
                disabled={disabled}
                onClick={() => onChange(key)}
                style={{
                  height: "36px",
                  borderRadius: selected ? "999px" : inWeek ? "14px" : "12px",
                  border: selected ? "1px solid rgba(147,197,253,0.95)" : "1px solid transparent",
                  background: selected
                    ? "linear-gradient(180deg, #5b8cff 0%, #2f68d8 100%)"
                    : inWeek
                      ? "rgba(96,165,250,0.18)"
                      : "transparent",
                  color: disabled ? "#4b5563" : sameMonth ? "#f8fafc" : "#64748b",
                  fontSize: "0.94rem",
                  fontWeight: selected || inWeek ? 950 : 850,
                  cursor: disabled ? "not-allowed" : "pointer",
                  opacity: disabled ? 0.45 : sameMonth ? 1 : 0.62,
                  boxShadow: selected ? "0 0 18px rgba(59,130,246,0.38)" : "none",
                }}
                aria-label={date.toLocaleDateString("es-ES")}
              >
                {date.getDate()}
              </button>
            );
          })}
        </div>

        <div style={{ height: "2px", marginBottom: "14px" }} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <button type="button" style={styles.confirmSecondaryBtnSolo} onClick={onCerrar}>Cancelar</button>
          <button type="button" style={{ ...styles.confirmPrimaryBtn, background: "#2563eb" }} onClick={onConfirmar}>Ir a la semana</button>
        </div>
      </div>
    </div>
  );
}

// 🔥 NUEVO: Componente exclusivo para la ventana flotante de Agua
function ModalRegistroAgua({ valor, onChange, onGuardar, onCancelar }) {
  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modalCard}>
        <div style={styles.modalTituloWrap}>
          <div style={styles.modalTituloPrincipal}>REGISTRO DE AGUA</div>
          <div style={styles.modalTituloSecundario}>
            <span style={styles.modalTituloIcono}>💧</span>
            <span style={styles.modalTituloTexto}>SOLO AGUA</span>
          </div>
        </div>
        <div style={{ marginBottom: "20px" }}>
          <Campo label="AGUA" icono="💧" unidad="ml" valor={valor} onChange={onChange} />
        </div>
        <button style={{ ...styles.btnPrincipalAzul, marginBottom: "8px" }} onClick={onGuardar}>GUARDAR DATOS</button>
        <button style={styles.confirmSecondaryBtnSolo} onClick={onCancelar}>CANCELAR</button>
      </div>
    </div>
  );
}

function ModalConfirmacionIngesta({ info, onConfirmar, onCancelar }) {
  const esGuardar = info.accion === "guardar";
  return (
    <div style={styles.confirmOverlay}>
      <div style={styles.confirmCard}>
        <div style={styles.confirmTitulo}>{esGuardar ? "GUARDAR DATOS" : "OMITIR INGESTA"}</div>
        <div style={styles.confirmMensaje}>
          {esGuardar ? `¿Confirmas el registro de ${info.comida}?` : `¿Seguro que deseas omitir ${info.comida}?`}
        </div>
        <div style={styles.confirmDetalle}>
          {esGuardar ? "Los valores se sumarán a tu progreso de hoy." : "Se registrará en cero y avanzará al siguiente paso."}
        </div>
        <div style={styles.confirmButtonsWrap}>
          <button type="button" onClick={onConfirmar} style={{ ...styles.confirmPrimaryBtn, background: esGuardar ? "#007c16" : "#7e1016" }}>CONFIRMAR</button>
          <button type="button" onClick={onCancelar} style={styles.confirmSecondaryBtn}>CANCELAR</button>
        </div>
      </div>
    </div>
  );
}

function AlertaDesayunoSaltadoModal({ onIrDesayuno, onContinuarColacion, onCerrar }) {
  return (
    <div style={styles.confirmOverlay}>
      <div style={styles.confirmCard}>
        <div style={styles.confirmTitulo}>⚠️ DESAYUNO PENDIENTE</div>
        <div style={styles.confirmMensaje}>No has registrado tu Desayuno hoy.</div>
        <div style={styles.confirmDetalle}>¿Deseas registrar la colación de todos modos o prefieres ingresar tu desayuno primero?</div>
        <div style={styles.confirmButtonsWrapColumn}>
          <button type="button" onClick={onIrDesayuno} style={{ ...styles.confirmPrimaryBtn, background: "#2452b0" }}>REGISTRAR DESAYUNO</button>
          <button type="button" onClick={onContinuarColacion} style={styles.confirmSecondaryBtnSolo}>CONTINUAR A COLACIÓN</button>
          <button type="button" onClick={onCerrar} style={{ ...styles.confirmSecondaryBtnSolo, background: "transparent", border: "none", color: "#8f96a4" }}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

function ModalRescateDia({ fechaKey, onGuardar, onDescartar }) {
  const fechaBonita = parseDateFromKey(fechaKey).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" }).toUpperCase();
  return (
    <div style={styles.confirmOverlay}>
      <div style={styles.confirmCard}>
        <div style={styles.confirmTitulo}>⚠️ DÍA SIN GUARDAR</div>
        <div style={styles.confirmMensaje}>Detectamos que no cerraste tu registro del <br/><span style={{color: "#ffd34d"}}>{fechaBonita}</span>.</div>
        <div style={styles.confirmDetalle}>¿Qué deseas hacer con esos datos?</div>
        <div style={styles.confirmButtonsWrapColumn}>
          <button type="button" onClick={onGuardar} style={styles.confirmPrimaryBtn}>RECUPERAR Y MODIFICAR</button>
          <button type="button" onClick={onDescartar} style={styles.confirmSecondaryBtnSolo}>DESCARTAR Y EMPEZAR HOY</button>
        </div>
      </div>
    </div>
  );
}

function ModalEditarRegistro({ registroActivo, camposEdicion, onChange, onActualizar, onCerrar, onBorrar }) {
  const esSoloAgua = registroActivo.tipo === "agua";
  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modalCard}>
        <button type="button" style={styles.modalDeleteBtn} onClick={onBorrar} aria-label="Borrar registro">🗑️</button>
        <div style={styles.modalTituloWrap}>
          <div style={styles.modalTituloPrincipal}>MODIFICAR</div>
          <div style={styles.modalTituloSecundario}><span style={styles.modalTituloIcono}>{registroActivo.icono}</span><span style={styles.modalTituloTexto}>{registroActivo.label.toUpperCase()}</span></div>
        </div>
        <div style={{ ...styles.gridRegistro, marginBottom: "18px", gridTemplateColumns: esSoloAgua ? "1fr" : "repeat(2, minmax(0, 1fr))" }}>
          {!esSoloAgua ? (
            <>
              <Campo label="KCAL" icono="🔥" unidad="kcal" valor={camposEdicion.kcal} onChange={(v) => onChange("kcal", v)} />
              <Campo label="PROT" icono="🥩" unidad="gr" valor={camposEdicion.prot} onChange={(v) => onChange("prot", v)} />
              <Campo label="CARB" icono="🍞" unidad="gr" valor={camposEdicion.carb} onChange={(v) => onChange("carb", v)} />
              <Campo label="GRAS" icono="🥑" unidad="gr" valor={camposEdicion.gras} onChange={(v) => onChange("gras", v)} />
              <Campo label="FIBR" icono="🌿" unidad="gr" valor={camposEdicion.fibr} onChange={(v) => onChange("fibr", v)} />
            </>
          ) : null}
          <Campo label="AGUA" icono="💧" unidad="ml" valor={camposEdicion.agua} onChange={(v) => onChange("agua", v)} />
        </div>
        <button style={{ ...styles.confirmPrimaryBtn, width: "100%", marginBottom: "8px" }} onClick={onActualizar}>ACTUALIZAR</button>
        <button style={styles.confirmSecondaryBtnSolo} onClick={onCerrar}>VOLVER</button>
      </div>
    </div>
  );
}

function ModalConfirmacionEdicion({ confirmacionActiva, onConfirmar, onCancelar }) {
  return (
    <div style={styles.confirmOverlay}>
      <div style={styles.confirmCard}>
        <div style={styles.confirmTitulo}>{confirmacionActiva.titulo}</div>
        <div style={styles.confirmMensaje}>{confirmacionActiva.mensaje}</div>
        <div style={styles.confirmDetalle}>{confirmacionActiva.detalle}</div>
        <div style={styles.confirmButtonsWrap}>
          <button type="button" onClick={onConfirmar} style={{ ...styles.confirmPrimaryBtn, background: confirmacionActiva.peligro ? "#7e1016" : "#007c16" }}>{confirmacionActiva.boton}</button>
          <button type="button" onClick={onCancelar} style={styles.confirmSecondaryBtn}>CANCELAR</button>
        </div>
      </div>
    </div>
  );
}

function PromptColacionModal({ promptColacionActiva, onRegistrar, onOmitir }) {
  return (
    <div style={styles.confirmOverlay}>
      <div style={styles.confirmCard}>
        <div style={styles.confirmTituloPendiente}>COLACIÓN PENDIENTE</div>
        <div style={styles.confirmRegistroRow}><span style={styles.confirmRegistroIcono}>{promptColacionActiva.icono}</span><span style={styles.confirmRegistroTextoPendiente}>{promptColacionActiva.label.toUpperCase()}</span></div>
        <div style={styles.confirmMensaje}>Antes de seguir, confirma la colación que corresponde.</div>
        <div style={styles.confirmDetalle}>Puedes ingresarla ahora o marcar que no hubo colación para seguir con la siguiente ingesta principal.</div>
        <div style={styles.confirmButtonsWrapColumn}>
          <button type="button" onClick={onRegistrar} style={styles.confirmPrimaryBtn}>INGRESAR AHORA</button>
          <button type="button" onClick={onOmitir} style={styles.confirmSecondaryBtnSolo}>NO HUBO COLACIÓN</button>
        </div>
      </div>
    </div>
  );
}

function FinalizarDiaModal({ modalFinalizar, onCerrar, onConfirmar }) {
  return (
    <div style={styles.confirmOverlay}>
      <div style={styles.confirmCard}>
        <div style={styles.confirmTitulo}>FINALIZAR DÍA</div>
        {modalFinalizar.puedeFinalizar ? (
          <>
            <div style={styles.confirmMensaje}>¿Deseas finalizar y guardar los datos del día?</div>
            <div style={styles.confirmDetalle}>Podrás seguir viendo Progreso de Hoy y todos los resúmenes aunque guardes el día.</div>
            <div style={styles.confirmButtonsWrap}>
              <button type="button" onClick={onConfirmar} style={styles.confirmPrimaryBtn}>GUARDAR DÍA</button>
              <button type="button" onClick={onCerrar} style={styles.confirmSecondaryBtn}>SEGUIR MODIFICANDO</button>
            </div>
          </>
        ) : (
          <>
            <div style={styles.confirmMensaje}>Aún tienes ingestas pendientes.</div>
            <div style={styles.confirmDetalle}>¿Estás seguro de cerrar el día? Las siguientes ingestas quedarán en cero:</div>
            <div style={styles.listaPendientesWrap}>{modalFinalizar.pendientes.map((item) => <div key={item} style={styles.pendienteLinea}>• {item}</div>)}</div>
            <div style={styles.confirmButtonsWrapColumn}>
              <button type="button" onClick={onConfirmar} style={{...styles.confirmPrimaryBtn, background: "#a63c06"}}>CERRAR DÍA ASÍ</button>
              <button type="button" onClick={onCerrar} style={styles.confirmSecondaryBtnSolo}>SEGUIR MODIFICANDO</button>
            </div>
          </>
      )}
      </div>
    </div>
  );
}

function ModalMetasDia({ camposMetas, onChange, onConfirmar, onCerrar }) {
  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modalCard}>
        <div style={styles.modalTituloWrap}>
          <div style={styles.modalTituloPrincipal}>CAMBIAR METAS</div>
          <div style={styles.modalTituloSecundario}><span style={styles.modalTituloIcono}>🎯</span><span style={styles.modalTituloTexto}>NUEVOS OBJETIVOS</span></div>
        </div>
        <div style={{ ...styles.gridRegistro, marginBottom: "18px" }}>
          <Campo label="KCAL" icono="🔥" unidad="kcal" valor={camposMetas.kcal} onChange={(v) => onChange("kcal", v)} />
          <Campo label="PROT" icono="🥩" unidad="gr" valor={camposMetas.prot} onChange={(v) => onChange("prot", v)} />
          <Campo label="CARB" icono="🍞" unidad="gr" valor={camposMetas.carb} onChange={(v) => onChange("carb", v)} />
          <Campo label="GRAS" icono="🥑" unidad="gr" valor={camposMetas.gras} onChange={(v) => onChange("gras", v)} />
          <Campo label="FIBR" icono="🌿" unidad="gr" valor={camposMetas.fibr} onChange={(v) => onChange("fibr", v)} />
          <Campo label="AGUA" icono="💧" unidad="ml" valor={camposMetas.agua} onChange={(v) => onChange("agua", v)} />
        </div>
        <button style={{ ...styles.confirmPrimaryBtn, width: "100%", marginBottom: "8px" }} onClick={onConfirmar}>GUARDAR CAMBIOS</button>
        <button style={styles.confirmSecondaryBtnSolo} onClick={onCerrar}>VOLVER</button>
      </div>
    </div>
  );
}

function Campo({ label, icono, unidad, valor, onChange, disabled }) {
  return (
    <div style={{ ...styles.campo, opacity: disabled ? 0.35 : 1 }}>
      <div style={styles.campoLabel}>
        <span style={{ fontSize: "1.1rem" }}>{icono}</span>
        <span>{label}</span>
      </div>
      <div style={styles.valorWrap}>
        <input type="text" inputMode="decimal" value={valor} onChange={(e) => onChange(e.target.value)} style={styles.campoInput} disabled={disabled} />
        <div style={styles.campoUnidad}>{unidad}</div>
      </div>
    </div>
  );
}
function getEstadoEmocionalProgreso(p, diaFinalizado) {
  if (p > 105) return { emoji: "👀", texto: "Cuidado, exceso" };

  if (diaFinalizado && p < 95) {
    return { emoji: "👀", texto: "Por debajo del objetivo" };
  }

  if (p >= 95) return { emoji: "🎉", texto: "Lo lograste" };

  if (p >= 75) return { emoji: "🤏", texto: "Ya falta poquito" };

  if (p >= 30) return { emoji: "🏃", texto: "En marcha..." };

  return null;
}

function MetasCombinadasAviso({ texto = "Durante el día se modificaron las metas. El cálculo del progreso combina la meta anterior con la nueva para reflejar el avance real.", compacto = false }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div style={compacto ? styles.metasCombinadasWrapCompacto : styles.metasCombinadasWrap}>
      <style>{`
        @keyframes pulseMetasCombinadas {
          0% { transform: scale(1); filter: brightness(1); box-shadow: 0 0 0 rgba(251,191,36,0); }
          50% { transform: scale(1.12); filter: brightness(1.25); box-shadow: 0 0 16px rgba(251,191,36,0.55); }
          100% { transform: scale(1); filter: brightness(1); box-shadow: 0 0 0 rgba(251,191,36,0); }
        }
      `}</style>
      <button
        type="button"
        aria-label="Metas combinadas"
        title="Metas combinadas"
        style={compacto ? styles.metasCombinadasBtnCompacto : styles.metasCombinadasBtn}
        onClick={(e) => {
          e.stopPropagation();
          setAbierto((prev) => !prev);
        }}
      >
        ⚠️ 🔀
      </button>
      {abierto ? (
        <div style={compacto ? styles.metasCombinadasTooltipCompacto : styles.metasCombinadasTooltip}>
          <div style={styles.metasCombinadasTooltipTitulo}>⚠️ Metas combinadas</div>
          <div>{texto}</div>
        </div>
      ) : null}
    </div>
  );
}

function IndicadorProgreso({ icono, label, unidad, actual, meta, color, esCombinada, diaFinalizado = false, resumenPlano = false }) {
  const [mostrarInfo, setMostrarInfo] = useState(false);
  const porcentajeRaw = meta > 0 ? (actual / meta) * 100 : 0;
  const porcentaje = Math.min(100, Math.max(0, porcentajeRaw));
  const estado = getEstadoEmocionalProgreso(porcentajeRaw, diaFinalizado);
  const colorDinamico = getProgressAccentColor(porcentajeRaw);
  const activarPulso = porcentajeRaw >= 80;

  return (
    <div style={styles.progresoItemPremium}>
      <style>{`
        @keyframes pulseBar80 {
          0% {
            transform: scaleY(1);
            opacity: 0.92;
            filter: brightness(1);
          }
          50% {
            transform: scaleY(1.35);
            opacity: 1;
            filter: brightness(1.28);
          }
          100% {
            transform: scaleY(1);
            opacity: 0.92;
            filter: brightness(1);
          }
        }
      `}</style>

      <div style={styles.progresoTopLine}>
        <div style={styles.progresoIconoTitulo}>
          <span>{icono}</span>
          <span style={styles.progresoCardTitulo}>{label}</span>
        </div>

        {esCombinada ? (
          <MetasCombinadasAviso />
        ) : null}
      </div>

      <div style={styles.progresoCaraACara}>
        <div style={{ ...styles.progresoConsumido, color: colorDinamico }}>
          {Math.round(actual)}
        </div>

        <div style={styles.progresoMetaDisplay}>
          <span style={styles.progresoSeparador}>/</span>
          {Math.round(meta)}
          <span style={styles.progresoUnidad}>
            {unidad}
            {esCombinada ? "*" : ""}
          </span>
        </div>
      </div>

      <div style={styles.progresoBottomArea}>
        <div style={styles.progresoTrackDelgado}>
          <div
            style={{
              ...styles.progresoFillDelgado,
              width: `${porcentaje}%`,
              background: GRADIENTE_PROGRESO,
              animation: activarPulso ? "pulseBar80 0.8s ease-in-out infinite" : "none",
              transformOrigin: "left center",
              boxShadow: activarPulso
  ? "0 0 22px rgba(255,255,255,0.68), 0 0 14px rgba(255,255,255,0.42)"
  : "none",
            }}
          />
        </div>

        <div style={styles.progresoTextosAbajo}>
          {resumenPlano ? (
            <span style={{ color: "#98a0ae", fontSize: "0.85rem", fontWeight: 700 }}>
              {`Progreso ${Math.round(porcentajeRaw)}%`}
            </span>
          ) : (
            <>
              <span style={{ color: "#98a0ae", fontSize: "0.85rem", fontWeight: 700 }}>
                {estado ? (
                  <>
                    <span
                      style={{
                        display: "inline-block",
                        transform: estado.emoji.includes("🏃") ? "scaleX(-1)" : "none",
                      }}
                    >
                      {estado.emoji}
                    </span>{" "}
                    {estado.texto}
                  </>
                ) : ""}
              </span>

              <span style={{ fontWeight: 900, color: "#ffffff" }}>
                {Math.round(porcentajeRaw)}%
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
// ============================================================================
// 🎨 BLOQUE 6: ESTILOS VISUALES (DISEÑO Y COLORES)
// ============================================================================

const cardBase = { background: "#050912", border: "1px solid #232938", borderRadius: "28px", position: "relative" };
const styles = {
  app: { minHeight: "100vh", background: "#000000", color: "#ffffff", paddingTop: "max(14px, env(safe-area-inset-top))", paddingRight: "12px", paddingBottom: "calc(40px + env(safe-area-inset-bottom))", paddingLeft: "12px", fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', boxSizing: "border-box" },
  screen: { width: "100%", maxWidth: "520px", margin: "0 auto" },
  sugerenciaExportWrap: { width: "100%" },
  titulo: { textAlign: "center", fontSize: "clamp(2rem, 7vw, 2.6rem)", margin: "12px 0 16px", fontWeight: 800, lineHeight: 1.08 },
  tituloPdf: { textAlign: "center", fontSize: "clamp(2.05rem, 7.2vw, 2.7rem)", margin: "10px 0 18px", fontWeight: 900, lineHeight: 1.06, color: "#ffffff", letterSpacing: "0.3px", textShadow: "0 0 10px rgba(255,255,255,0.18), 0 0 22px rgba(255,255,255,0.08)" },
  
  mensajeToast: { position: "fixed", top: "20px", left: "50%", transform: "translateX(-50%)", background: "#1a2436", border: "1px solid #3b4b6b", color: "#8fd857", padding: "14px 24px", borderRadius: "999px", fontWeight: 900, fontSize: "1.05rem", zIndex: 9999, boxShadow: "0 10px 30px rgba(0,0,0,0.5)", whiteSpace: "nowrap" },
  mensaje: { marginTop: "12px", textAlign: "center", color: "#b8d7ff", fontWeight: 700, fontSize: "0.92rem" },

  bienvenida: { textAlign: "center", marginBottom: "20px" },
  saludo: { color: "#69b7ff", fontSize: "clamp(1.1rem, 4.8vw, 1.3rem)", fontWeight: 800, marginBottom: "4px" },
  fecha: { color: "#69b7ff", fontSize: "clamp(0.85rem, 3.4vw, 1rem)", fontWeight: 800, textTransform: "uppercase", lineHeight: 1.25 },
  sugerenciaCard: { ...cardBase, padding: "clamp(14px, 4vw, 18px)", marginBottom: "18px" },
  card: { ...cardBase, padding: "clamp(14px, 4vw, 18px)", marginBottom: "18px" },
  cardRegistros: { ...cardBase, padding: "clamp(14px, 4vw, 18px)", marginBottom: "18px" },
  
  cardProgresoContainer: { ...cardBase, padding: "20px 16px 18px" },
  resumenSemanalSinMarcoExterno: { width: "100%", padding: "2px 0 0" },
  headerResumenPeriodoCompacto: { textAlign: "center", marginBottom: "16px", paddingLeft: "6px", paddingRight: "6px" },
  headerResumenPeriodoTitulo: { fontSize: "clamp(1.15rem, 3.6vw, 1.45rem)", fontWeight: 900, lineHeight: 1.08, color: "#ffffff", textTransform: "uppercase", whiteSpace: "pre-line", marginBottom: "10px" },
  headerResumenPeriodoFecha: { color: "#69b7ff", fontSize: "clamp(0.95rem, 3.6vw, 1.1rem)", fontWeight: 900, textTransform: "uppercase", lineHeight: 1.2 },
  botonesMenuGridPreview: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "10px", marginBottom: "16px", alignItems: "stretch" },
  homeTopBtnProgreso: { position: "absolute", top: "16px", right: "16px", width: "42px", height: "42px", borderRadius: "999px", border: "1px solid #3b4252", background: "#141a24", cursor: "pointer", fontSize: "1.15rem", zIndex: 10 },
  headerProgresoHoy: { textAlign: "center", marginBottom: "14px", paddingLeft: "18px", paddingRight: "18px" },
  headerProgresoHoyTitulo: { fontSize: "clamp(1.05rem, 3.1vw, 1.28rem)", fontWeight: 800, lineHeight: 1.15, color: "#ffffff", textTransform: "uppercase", whiteSpace: "pre-line" },
  headerResumenSemanalUnaLinea: { fontSize: "clamp(1rem, 3vw, 1.18rem)", fontWeight: 900, lineHeight: 1, color: "#ffffff", textTransform: "uppercase", whiteSpace: "nowrap", letterSpacing: "0.02em" },
  headerProgresoHoyFecha: { marginTop: "6px", color: "#69b7ff", fontSize: "clamp(0.84rem, 3.2vw, 0.98rem)", fontWeight: 800, textTransform: "uppercase", lineHeight: 1.15 },
  subheaderResumenSemana: { textAlign: "center", color: "#e8edf7", fontSize: "0.82rem", fontWeight: 900, letterSpacing: "0.04em", marginBottom: "4px", marginTop: "-2px" },
  espacioAvisoMetasCombinadasSemana: { minHeight: "28px", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "8px" },
  avisoMetasCombinadasSemanaInline: { color: "#ffd36b", fontSize: "0.8rem", fontWeight: 900, textAlign: "center", lineHeight: 1.15 },
  
  progresoScrollBox: { background: "#030408", border: "1px solid #1e2635", borderRadius: "20px", padding: "12px", maxHeight: "56vh", overflowY: "auto", marginBottom: "18px", WebkitOverflowScrolling: "touch", boxShadow: "inset 0 4px 12px rgba(0,0,0,0.5)" },
  progresoSemanalScrollBox: { background: "#030408", border: "1px solid #1e2635", borderRadius: "20px", padding: "12px", maxHeight: "52vh", overflowY: "auto", marginBottom: "16px", WebkitOverflowScrolling: "touch", boxShadow: "inset 0 4px 12px rgba(0,0,0,0.5)" },
  gridProgresoInterno: { display: "grid", gap: "12px" },
  notaResumenSemana: { marginTop: "0", padding: "0 10px 4px", textAlign: "center" },
  notaResumenSemanaEtiqueta: { color: "#e5e7eb", fontWeight: 900, marginRight: "6px" },
  notaResumenSemanaTexto: { color: "#a5b4cc", fontSize: "0.78rem", lineHeight: 1.45, maxWidth: "560px", margin: "0 auto" },
  
  // 🔥 ESTILOS NUEVOS PARA LAS TARJETAS PREMIUM DE PROGRESO
  progresoItemPremium: { background: "#0a0d16", border: "1px solid #1e2635", borderRadius: "20px", padding: "18px", marginBottom: "0px", position: "relative" },
  progresoTopLine: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" },
  progresoIconoTitulo: { display: "flex", alignItems: "center", gap: "8px" },
  progresoCardTitulo: { color: "#dce3ef", fontSize: "0.95rem", fontWeight: 900, letterSpacing: "0.5px" },
  infoIconWrap: { color: "#69b7ff", fontSize: "0.9rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", width: "24px", height: "24px", borderRadius: "50%", background: "rgba(105, 183, 255, 0.1)", fontWeight: 900 },
  infoTooltip: { background: "#1a2436", color: "#8cbcf5", padding: "12px 14px", borderRadius: "12px", fontSize: "0.85rem", fontWeight: 700, marginBottom: "14px", border: "1px solid #2e4163" },
  metasCombinadasWrap: { position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", zIndex: 20 },
  metasCombinadasWrapCompacto: { position: "relative", display: "flex", alignItems: "center", justifyContent: "center", marginTop: "8px", zIndex: 20 },
  metasCombinadasBtn: { border: "1px solid rgba(251,191,36,0.55)", background: "rgba(251,191,36,0.14)", color: "#fbbf24", borderRadius: "999px", width: "46px", height: "28px", fontSize: "1rem", fontWeight: 900, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", animation: "pulseMetasCombinadas 1.8s ease-in-out infinite" },
  metasCombinadasBtnCompacto: { border: "1px solid rgba(251,191,36,0.55)", background: "rgba(251,191,36,0.14)", color: "#fbbf24", borderRadius: "999px", minWidth: "54px", height: "30px", padding: "0 10px", fontSize: "1rem", fontWeight: 900, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", animation: "pulseMetasCombinadas 1.8s ease-in-out infinite" },
  metasCombinadasTooltip: { position: "absolute", right: 0, top: "34px", width: "min(260px, 72vw)", background: "#151b27", color: "#e5e7eb", padding: "12px 14px", borderRadius: "14px", fontSize: "0.78rem", fontWeight: 750, lineHeight: 1.35, border: "1px solid rgba(251,191,36,0.35)", boxShadow: "0 14px 34px rgba(0,0,0,0.45)", textAlign: "left" },
  metasCombinadasTooltipCompacto: { position: "absolute", left: "50%", transform: "translateX(-50%)", bottom: "38px", width: "min(280px, 76vw)", background: "#151b27", color: "#e5e7eb", padding: "12px 14px", borderRadius: "14px", fontSize: "0.78rem", fontWeight: 750, lineHeight: 1.35, border: "1px solid rgba(251,191,36,0.35)", boxShadow: "0 14px 34px rgba(0,0,0,0.45)", textAlign: "left" },
  metasCombinadasTooltipTitulo: { color: "#fbbf24", fontWeight: 950, marginBottom: "5px" },
  progresoCaraACara: { display: "flex", alignItems: "baseline", gap: "6px", marginBottom: "16px" },
  progresoConsumido: { fontSize: "2.4rem", fontWeight: 900, lineHeight: 1 },
  progresoMetaDisplay: { color: "#8f96a4", fontSize: "1.25rem", fontWeight: 800 },
  progresoSeparador: { color: "#3b4252", fontSize: "1.8rem", fontWeight: 300, marginRight: "4px" },
  progresoUnidad: { fontSize: "0.85rem", fontWeight: 700, marginLeft: "4px" },
  progresoBottomArea: { width: "100%" },
  progresoTrackDelgado: { width: "100%", height: "6px", background: "#171c26", borderRadius: "999px", overflow: "hidden", marginBottom: "8px", boxShadow: "inset 0 1px 3px rgba(0,0,0,0.5)" },
  progresoFillDelgado: { height: "100%", borderRadius: "999px", transition: "width 0.4s ease-out" },
  progresoTextosAbajo: { display: "flex", justifyContent: "space-between", alignItems: "center" },

  headerFocusFloating: { position: "absolute", left: "50%", top: "24px", transform: "translateX(-50%)", zIndex: 4, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" },
  headerSaveFloating: { position: "absolute", right: "16px", top: "22px", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" },
  btnTresPuntosCard: { background: "transparent", border: "none", color: "#ffffff", fontSize: "2rem", fontWeight: "bold", cursor: "pointer", padding: "0 8px", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", outline: "none" },
  menuDatosBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.74)",
    backdropFilter: "blur(4px)",
    WebkitBackdropFilter: "blur(4px)",
    zIndex: 1000,
  },
  menuDatosModalWrap: {
    position: "fixed",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
    zIndex: 1001,
  },
  menuDatosDropdownCard: { display: "none" },
  menuDatosCard: {
    width: "min(92vw, 380px)",
    background: "linear-gradient(180deg, rgba(20,26,39,0.98) 0%, rgba(12,17,29,0.98) 100%)",
    border: "1px solid rgba(86,100,132,0.42)",
    borderRadius: "24px",
    overflow: "hidden",
    boxShadow: "0 22px 54px rgba(0,0,0,0.58)",
    padding: "10px",
  },
  menuDatosTitulo: {
    padding: "14px 14px 2px",
    color: "#f7fbff",
    fontSize: "1.2rem",
    fontWeight: 900,
    textAlign: "center",
    letterSpacing: "0.2px",
  },
  menuDatosSubtitulo: {
    padding: "0 18px 14px",
    color: "#9fb0ca",
    fontSize: "0.88rem",
    fontWeight: 700,
    textAlign: "center",
    lineHeight: 1.35,
  },
  menuDatosDivider: {
    height: "1px",
    background: "rgba(71,83,111,0.55)",
    margin: "8px 4px",
  },
  menuDatosOption: {
    width: "100%",
    border: "1px solid rgba(62,76,103,0.42)",
    background: "rgba(255,255,255,0.03)",
    color: "#ffffff",
    padding: "15px 16px",
    textAlign: "left",
    borderRadius: "18px",
    fontSize: "1rem",
    fontWeight: 800,
    cursor: "pointer",
    transition: "transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "4px",
    marginBottom: "8px",
    boxShadow: "0 8px 18px rgba(0,0,0,0.18)",
  },
  menuDatosOptionMain: {
    color: "#f7fbff",
    fontSize: "1rem",
    fontWeight: 900,
    lineHeight: 1.15,
  },
  menuDatosOptionSub: {
    color: "#9fb0ca",
    fontSize: "0.8rem",
    fontWeight: 700,
    lineHeight: 1.3,
  },
  menuDatosOptionSave: {
    background: "rgba(143,216,87,0.10)",
    border: "1px solid rgba(143,216,87,0.42)",
    boxShadow: "0 10px 24px rgba(143,216,87,0.12)",
  },
  homeActualizadaWrap: { width: "100%", display: "flex", justifyContent: "center", marginTop: "12px", marginBottom: "4px" },
  homeActualizadaTopRow: { width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" },
  homeActualizadaActionLeft: { display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" },
  homeActualizadaActionRight: { display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" },
  homeActualizadaEmoji: { fontSize: "1.65rem", lineHeight: 1, animation: "pulseGlowBtn 1.8s infinite" },
  homeActualizadaHint: { color: "#cfd6e6", fontSize: "0.94rem", fontWeight: 700 },
  botonPanelFinal: { background: "rgba(255,255,255,0.04)", border: "1px solid #3a4154", color: "#ffffff", borderRadius: "18px", minHeight: "56px", fontWeight: 900, fontSize: "1rem", cursor: "pointer" },

  headerTextCenter: { display: "flex", justifyContent: "center", alignItems: "center", textAlign: "center", minWidth: 0 },
  headerTextSugerencia: { display: "flex", justifyContent: "center", alignItems: "center", textAlign: "center", minWidth: 0, paddingTop: "34px", marginBottom: "18px" },
  headerMainText: { color: "#b7bcc8", fontSize: "clamp(0.78rem, 3.1vw, 1rem)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.3px", lineHeight: 1.2 },
  sugerenciaCaptureArea: { width: "100%", borderRadius: "20px", display: "flex", flexDirection: "column", alignItems: "stretch", justifyContent: "center", paddingTop: "24px" },
  sugerenciaEmoji: { fontSize: "clamp(1.45rem, 4.4vw, 1.7rem)", lineHeight: 1, textShadow: "0 0 10px rgba(255,255,150,0.9), 0 0 20px rgba(255,255,150,0.55)" },
  btnCapturaEmojiFloating: { position: "absolute", left: "16px", top: "22px", zIndex: 4, width: "42px", height: "42px", borderRadius: "999px", border: "1px solid #3b4252", background: "#141a24", color: "#ffffff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, boxShadow: "0 0 0 1px rgba(255,255,255,0.03)" },
  btnCapturaEmojiIcon: { fontSize: "1.2rem", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", transform: "translateY(0)" },
  btnGuardarEmoji: { width: "48px", height: "48px", borderRadius: "999px", border: "1px solid #3b4252", background: "#141a24", color: "#ffffff", cursor: "pointer", fontSize: "1.4rem", boxShadow: "0 0 0 1px rgba(255,255,255,0.03)" },
  btnGuardarEmojiLlamativo: { border: "1px solid #8fd857", boxShadow: "0 0 0 1px rgba(184,229,88,0.2), 0 0 16px rgba(184,229,88,0.28)" },
  avisoDiaGuardado: { marginTop: "4px", background: "#101720", border: "1px solid #273142", borderRadius: "18px", padding: "18px 16px", textAlign: "center" },
  avisoDiaGuardadoTexto: { color: "#dfe7f3", fontSize: "1rem", fontWeight: 800 },
  avisoCompletoWrap: { marginTop: "4px", background: "#121821", border: "1px solid #2d3748", borderRadius: "18px", padding: "16px", textAlign: "center" },
  avisoCompletoTitulo: { color: "#ffd34d", fontSize: "0.98rem", fontWeight: 900, marginBottom: "8px" },
  avisoCompletoDetalle: { color: "#c6cfdd", fontSize: "0.87rem", lineHeight: 1.35 },
  
  sugerenciaGrid: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "10px", marginTop: "10px" },
  sugerenciaMiniCard: { position: "relative", background: "#05070d", border: "1px solid #1e2635", borderRadius: "18px", padding: "14px 14px 16px", minHeight: "88px", overflow: "hidden" },
  sugerenciaMiniTop: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" },
  sugerenciaMiniIcon: { fontSize: "1rem", lineHeight: 1 },
  sugerenciaMiniTitle: { color: "#dce3ef", fontSize: "0.82rem", fontWeight: 800, letterSpacing: "0.25px" },
  sugerenciaMiniValue: { fontSize: "1.22rem", fontWeight: 900, lineHeight: 1 },
  sugerenciaMiniUnit: { color: "#d9dee7", fontSize: "0.78rem", fontWeight: 800, marginLeft: "4px" },
  sugerenciaMiniLine: { position: "absolute", left: 0, right: 0, bottom: 0, height: "5px", borderBottomLeftRadius: "18px", borderBottomRightRadius: "18px" },
  
  btnPrincipalAzul: { width: "100%", border: "none", borderRadius: "18px", padding: "16px", color: "#ffffff", fontWeight: 900, fontSize: "1.05rem", cursor: "pointer", background: "linear-gradient(180deg, #2d9cff 0%, #0077e6 100%)", boxShadow: "0 10px 22px rgba(0,119,230,0.22)" },
  botonesAtajosGrid: { display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "12px", marginTop: "12px" },
  
  btnAtajo: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "6px", background: "#151b25", border: "1px solid #30394a", borderRadius: "18px", padding: "14px 10px", cursor: "pointer", transition: "all 0.2s" },
  btnAtajoGhost: { background: "rgba(21, 27, 37, 0.4)", border: "1px solid rgba(48, 57, 74, 0.4)", opacity: 0.6, cursor: "default" },
  btnAtajoIcono: { fontSize: "1.6rem", lineHeight: 1 },
  btnAtajoTexto: { color: "#ffffff", fontSize: "0.85rem", fontWeight: 800, letterSpacing: "0.5px", textAlign: "center" },
  btnAtajoTextoGhost: { color: "#8f96a4", fontSize: "0.85rem", fontWeight: 800, letterSpacing: "0.5px", textAlign: "center" },
  
  botonesMenuGrid: { display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "12px", marginTop: "12px" },
  btnMenuSecundario: { width: "100%", border: "1px solid #30394a", borderRadius: "18px", padding: "14px 10px", background: "#11161f", color: "#b7bcc8", fontWeight: 800, fontSize: "0.85rem", cursor: "pointer" },
  btnSecundarioOmitir: { width: "100%", background: "transparent", border: "1px solid #3a4254", borderRadius: "18px", padding: "16px", color: "#a9afba", fontWeight: 800, fontSize: "0.95rem", cursor: "pointer", marginTop: "12px" },

  homeTopBtn: { position: "absolute", top: "14px", right: "14px", width: "42px", height: "42px", borderRadius: "999px", border: "1px solid #3b4252", background: "#141a24", cursor: "pointer", fontSize: "1.15rem" },
  headerRegistroCenter: { display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", marginTop: "4px", marginBottom: "16px" },
  registroEmoji: { fontSize: "1.45rem", lineHeight: 1 },
  
  gridRegistro: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px", width: "100%", alignItems: "stretch" },
  campo: { position: "relative", background: "#03060d", border: "1px solid #1e2635", borderRadius: "18px", minHeight: "102px", padding: "10px 12px", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.015)", width: "100%", minWidth: 0, maxWidth: "100%", overflow: "hidden", boxSizing: "border-box" },
  campoLabel: { position: "absolute", top: "10px", left: "12px", color: "#a9afba", fontSize: "0.82rem", fontWeight: 800, letterSpacing: "0.2px", display: "flex", alignItems: "center", gap: "5px" },
  valorWrap: { position: "absolute", top: "54%", left: "50%", transform: "translate(-50%, -18%)", display: "flex", alignItems: "center", gap: "6px", maxWidth: "calc(100% - 24px)" },
  campoInput: { width: "74px", background: "transparent", border: "none", outline: "none", color: "#ffffff", fontSize: "1.15rem", fontWeight: 900, textAlign: "right" },
  campoUnidad: { color: "#8f96a4", fontSize: "0.78rem", fontWeight: 800 },
  headerTusRegistros: { display: "flex", justifyContent: "center", alignItems: "center", gap: "10px", marginTop: "4px", marginBottom: "18px" },
  emojiTusRegistros: { fontSize: "1.45rem", lineHeight: 1 },
  tituloTusRegistros: { color: "#b7bcc8", fontSize: "clamp(0.9rem, 3.2vw, 1.02rem)", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.3px" },
  
  modalOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px", zIndex: 1200 },
  modalCard: { position: "relative", width: "100%", maxWidth: "480px", background: "#050912", border: "1px solid #232938", borderRadius: "28px", padding: "20px 16px 16px", boxShadow: "0 30px 60px rgba(0,0,0,0.55)" },
  modalDeleteBtn: { position: "absolute", top: "12px", right: "12px", width: "42px", height: "42px", borderRadius: "999px", border: "1px solid #3c4457", background: "#141a24", cursor: "pointer", fontSize: "1.15rem" },
  modalTituloWrap: { textAlign: "center", marginBottom: "16px" },
  modalTituloPrincipal: { color: "#b7bcc8", fontSize: "1.3rem", fontWeight: 900, marginBottom: "8px", letterSpacing: "0.4px" },
  modalTituloSecundario: { display: "flex", justifyContent: "center", alignItems: "center", gap: "8px" },
  modalTituloIcono: { fontSize: "1rem", lineHeight: 1 },
  modalTituloTexto: { color: "#b7bcc8", fontSize: "0.96rem", fontWeight: 800, letterSpacing: "0.3px" },
  
  confirmOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "18px", zIndex: 1300 },
  confirmCard: { width: "100%", maxWidth: "390px", background: "#0f131b", border: "1px solid #273043", borderRadius: "24px", padding: "20px 16px 16px", boxShadow: "0 22px 50px rgba(0,0,0,0.45)" },
  confirmTitulo: { textAlign: "center", color: "#b7bcc8", fontSize: "1.12rem", fontWeight: 900, marginBottom: "12px" },
  confirmTituloPendiente: { textAlign: "center", color: "#ffffff", fontSize: "1.28rem", fontWeight: 950, letterSpacing: "0.4px", marginBottom: "12px", textShadow: "0 0 10px rgba(255,255,255,0.5), 0 0 22px rgba(105,183,255,0.25)", animation: "pulsePendingTitle 1.8s ease-in-out infinite" },
  confirmRegistroRow: { display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginBottom: "12px" },
  confirmRegistroIcono: { fontSize: "1rem" },
  confirmRegistroTexto: { color: "#b7bcc8", fontWeight: 800, fontSize: "0.95rem", letterSpacing: "0.3px" },
  confirmRegistroTextoPendiente: { color: "#ffffff", fontWeight: 950, fontSize: "1.02rem", letterSpacing: "0.35px", textShadow: "0 0 8px rgba(255,255,255,0.25)" },
  confirmMensaje: { textAlign: "center", color: "#ffffff", fontSize: "0.98rem", fontWeight: 800, lineHeight: 1.3, marginBottom: "8px" },
  confirmDetalle: { textAlign: "center", color: "#98a0ae", fontSize: "0.84rem", lineHeight: 1.35, marginBottom: "14px" },
  confirmButtonsWrap: { display: "flex", gap: "10px" },
  confirmButtonsWrapColumn: { display: "grid", gap: "10px" },
  confirmPrimaryBtn: { flex: 1, border: "none", borderRadius: "16px", padding: "14px", color: "#ffffff", fontWeight: 900, cursor: "pointer", background: "#007c16", minHeight: "50px" },
  confirmSecondaryBtn: { flex: 1, border: "1px solid #3a4254", borderRadius: "16px", padding: "14px", color: "#ffffff", fontWeight: 800, cursor: "pointer", background: "#1a202c", minHeight: "50px" },
  confirmSecondaryBtnSolo: { width: "100%", border: "1px solid #3a4254", borderRadius: "16px", padding: "14px", color: "#ffffff", fontWeight: 800, cursor: "pointer", background: "#1a202c", minHeight: "50px" },
  
  listaPendientesWrap: { marginBottom: "14px" },
  pendienteLinea: { color: "#ffffff", fontSize: "0.92rem", textAlign: "left", marginBottom: "6px" },
  previewPdfShell: { background: "transparent", border: "none", borderRadius: "0px", padding: "0px", marginBottom: "18px", boxShadow: "none", position: "relative" },
  previewPdfTopActions: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px", marginBottom: "14px" },
  previewPdfBackBtn: { minHeight: "58px", borderRadius: "22px", border: "1px solid #465069", background: "linear-gradient(180deg, #313949 0%, #202735 100%)", color: "#ffffff", fontWeight: 950, fontSize: "0.96rem", cursor: "pointer", padding: "0 12px", boxShadow: "0 10px 24px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.08)", letterSpacing: "0.1px" },
  previewPdfPrintBtn: { minHeight: "58px", borderRadius: "22px", border: "1px solid #4a5876", background: "linear-gradient(180deg, #313949 0%, #202735 100%)", color: "#ffffff", fontWeight: 950, fontSize: "0.96rem", cursor: "pointer", padding: "0 12px", boxShadow: "0 10px 24px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.08)", letterSpacing: "0.1px" },
  previewPdfHelp: { color: "#c4cede", fontWeight: 800, fontSize: "0.95rem", textAlign: "center", lineHeight: 1.4, marginBottom: "14px" },
  previewPdfFrameWrap: { background: "transparent", border: "none", borderRadius: "0px", padding: "0px", overflow: "hidden", boxShadow: "none" },
  previewPdfFrame: { width: "100%", minHeight: "78vh", border: "none", borderRadius: "18px", background: "transparent", boxShadow: "none" },
  registroCardPremium: { border: "1px solid #1e2635", borderRadius: "16px", padding: "14px", cursor: "pointer", transition: "all 0.2s" },
  registroCardTop: { position: "relative", display: "flex", justifyContent: "center", alignItems: "center", marginBottom: "12px" },
  registroCardTitleWrap: { display: "flex", alignItems: "center", gap: "8px" },
  registroCardTitle: { color: "#ffffff", fontSize: "1.05rem", fontWeight: 800 },
  registroBadgesGrid: { display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "6px" },
  registroBadge: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", border: "1px solid", borderRadius: "10px", padding: "6px 2px", fontSize: "0.8rem" },
};

// Animación del menú abanico
if (typeof document !== "undefined") {
  const styleId = "menu-animation-style";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      @keyframes scaleFadeIn {
        0% { opacity: 0; transform: scale(0.95); }
        100% { opacity: 1; transform: scale(1); }
      }
      @keyframes pulsePendingTitle {
        0% { opacity: 0.88; text-shadow: 0 0 6px rgba(255,255,255,0.28), 0 0 14px rgba(105,183,255,0.12); }
        50% { opacity: 1; text-shadow: 0 0 14px rgba(255,255,255,0.72), 0 0 30px rgba(105,183,255,0.35); }
        100% { opacity: 0.88; text-shadow: 0 0 6px rgba(255,255,255,0.28), 0 0 14px rgba(105,183,255,0.12); }
      }
    `;
    document.head.appendChild(style);
  }
}

export default App;

