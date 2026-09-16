"use client";

import type { ComponentType } from "react";
import type { ModuleDef } from "@/lib/modules";
import { ModulePlaceholder } from "@/components/dashboard/module-meta";
import { SortenkatalogDemo } from "@/components/demo/markt";
import { KuehlketteMock } from "@/components/demo/mocks";

type ModuleView = ComponentType<{ module: ModuleDef }>;

const plain = (Cmp: ComponentType): ModuleView =>
  function Wrapped() {
    return <Cmp />;
  };

// Diese Registry ist der Rueckfall fuer Module OHNE serverseitige Ansicht.
// Alles, was in src/components/db/server-module-views.tsx einen case hat,
// laeuft dort - auch im Demo-Modus, weil die Datenschicht in beiden
// Betriebsarten dieselbe Oberflaeche bedient. Ein Eintrag fuer ein solches
// Modul waere unerreichbar: ModulePageBody nimmt `children ?? <ModuleView>`,
// und children ist dann nie null.
const registry: Record<string, ModuleView> = {
  sortenkatalog: plain(SortenkatalogDemo),
  kuehlkette: KuehlketteMock,
};

export function ModuleView({ module }: { module: ModuleDef }) {
  const Cmp = registry[module.key];
  if (Cmp) return <Cmp module={module} />;
  return <ModulePlaceholder module={module} />;
}
