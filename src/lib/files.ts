import { DockIn, isNativeApp } from "./native";

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  txt: "text/plain",
};

/** The right type from the name: phones often report "" for Office files. */
export function mimeOf(name: string, fallback = ""): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return MIME[ext] ?? (fallback || "application/octet-stream");
}

export async function toBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

/**
 * Opens a document the way the phone opens documents. Inside the app the
 * WebView cannot download a file the page holds, so it goes to the phone's own
 * viewer (PDF, Word…) natively; in a browser it is shared or downloaded.
 */
export async function openDocument(blob: Blob, name: string): Promise<void> {
  if (isNativeApp()) {
    try {
      await DockIn.openFile({ name, mime: mimeOf(name, blob.type), data: await toBase64(blob) });
      return;
    } catch (e) {
      // An older app without openFile: fall through to the share sheet.
      if (!/not implemented|openFile/i.test(String(e))) throw e;
    }
  }
  const file = new File([blob], name, { type: mimeOf(name, blob.type) });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
