"use client";

import type { ComponentType } from "react";
import type { ModuleDef } from "@/lib/modules";
import { ModulePlaceholder } from "@/components/dashboard/module-meta";
import { RollenDemo } from "@/components/demo/buero";
import { SortenkatalogDemo } from "@/components/demo/markt";
import { KuehlketteMock } from "@/components/demo/mocks";

type ModuleView = ComponentType<{ module: ModuleDef }>;

const plain = (Cmp: ComponentType): ModuleView =>
  function Wrapped() {
    return <Cmp />;
  };

// Standort, Reihenbloecke, Pflueckaufgaben, Dokumente und Compliance laufen
// ueber die serverseitigen Ansichten in src/components/db/ - auch im Demo-Modus.
//
// WMC-Vibecode-Cleanup: die fruehere Eintraege pflanzenschutz/personal/
// schulungen sind entfernt - server-module-views.tsx liefert fuer diese drei
// Modulschluessel immer eine echte Ansicht als children von ModulePageBody,
// diese Registry-Zeilen wurden also nie mehr erreicht (siehe dortigen
// switch). Die zugehoerigen Demo-Komponenten (PflanzenschutzDemo,
// PersonalDemo, SchulungenDemo) sind ebenfalls entfernt.
const registry: Record<string, ModuleView> = {
  rollen: plain(RollenDemo),
  sortenkatalog: plain(SortenkatalogDemo),
  kuehlkette: KuehlketteMock,
};

export function ModuleView({ module }: { module: ModuleDef }) {
  const Cmp = registry[module.key];
  if (Cmp) return <Cmp module={module} />;
  return <ModulePlaceholder module={module} />;
}
