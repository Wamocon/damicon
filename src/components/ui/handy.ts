"use client";

import { useSyncExternalStore } from "react";

// Ist das Fenster schmaler als Tailwinds `md`? Fuer die wenigen Faelle, in
// denen die Antwort nicht mit CSS zu haben ist, weil nicht nur die
// Darstellung sich aendert, sondern was ueberhaupt gerendert wird: der Kopf
// des KI-Blatts traegt auf dem Handy zwei Knoepfe statt vier, der Agent-Modus
// ruht dort, und Himbi steht in der unteren Leiste statt frei im Bild.
//
// Alles, was sich mit einer Media Query loesen laesst, gehoert auch dorthin -
// dieser Haken kostet einen zweiten Renderdurchgang.
//
// Der Server rendert die Schreibtisch-Fassung; auf dem Handy zieht sich die
// Oberflaeche nach der Hydration zurecht. Dieselbe Abwaegung wie bei der
// Breite der Seitenleiste (sidebar-zustand.ts) und bei persona.tsx.
const ABFRAGE = "(max-width: 767.98px)";

function abonnieren(callback: () => void) {
  const liste = window.matchMedia(ABFRAGE);
  liste.addEventListener("change", callback);
  return () => liste.removeEventListener("change", callback);
}

function lesen() {
  return window.matchMedia(ABFRAGE).matches;
}

function serverWert() {
  return false;
}

export function useIstHandy(): boolean {
  return useSyncExternalStore(abonnieren, lesen, serverWert);
}
