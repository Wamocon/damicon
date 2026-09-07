"use client";

import type { ComponentType } from "react";
import type { ModuleDef } from "@/lib/modules";
import { ModulePlaceholder } from "@/components/dashboard/module-meta";
import { PflanzenschutzDemo } from "@/components/demo/feld-extra";
import { PersonalDemo, RollenDemo } from "@/components/demo/buero";
import { SchulungenDemo, SortenkatalogDemo } from "@/components/demo/markt";
import { KiAssistentMock, KuehlketteMock } from "@/components/demo/mocks";

type ModuleView = ComponentType<{ module: ModuleDef }>;

const plain = (Cmp: ComponentType): ModuleView =>
  function Wrapped() {
    return <Cmp />;
  };

// Standort, Reihenbloecke, Pflueckaufgaben, Dokumente und Compliance laufen
// ueber die serverseitigen Ansichten in src/components/db/ - auch im Demo-Modus.
const registry: Record<string, ModuleView> = {
  pflanzenschutz: plain(PflanzenschutzDemo),
  rollen: plain(RollenDemo),
  personal: plain(PersonalDemo),
  sortenkatalog: plain(SortenkatalogDemo),
  schulungen: plain(SchulungenDemo),
  kuehlkette: KuehlketteMock,
  ki_assistent: KiAssistentMock,
};

export function ModuleView({ module }: { module: ModuleDef }) {
  const Cmp = registry[module.key];
  if (Cmp) return <Cmp module={module} />;
  return <ModulePlaceholder module={module} />;
}
