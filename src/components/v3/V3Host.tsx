"use client";

import { usePathname } from "next/navigation";
import { usePreview } from "@/lib/v3/flags";
import { closeAssistant, openAssistant, useV3Screens } from "@/lib/v3/ui";
import { tabOf } from "@/lib/tabs";
import { cx } from "../ui";
import { Assistant } from "./Assistant";
import { DockBot } from "./DockBot";
import { Outpass } from "./Outpass";

/**
 * DockIn 3 on the preview build only: DockBot's floating button on the tab
 * screens, and the assistant and outpass screens over everything.
 */
export function V3Host() {
  const on = usePreview();
  const pathname = usePathname();
  const screens = useV3Screens();
  if (!on) return null;
  const tab = tabOf(pathname);
  const showFab = !!tab && tab !== "/settings" && !screens.ask && !screens.pass;
  return (
    <>
      {showFab && (
        <button
          type="button"
          onClick={openAssistant}
          aria-label="Ask DockBot"
          className={cx("bot-fab no-rise", (tab === "/tasks" || tab === "/circle") && "bot-fab-high")}
        >
          <DockBot size={46} />
        </button>
      )}
      <Assistant open={screens.ask} onClose={closeAssistant} />
      <Outpass />
    </>
  );
}
