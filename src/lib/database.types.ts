export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      aggregator_einstellungen: {
        Row: {
          id: string
          spanne_prozent: number
          updated_at: string
        }
        Insert: {
          id?: string
          spanne_prozent?: number
          updated_at?: string
        }
        Update: {
          id?: string
          spanne_prozent?: number
          updated_at?: string
        }
        Relationships: []
      }
      arbeitszeiten: {
        Row: {
          beginn: string
          created_at: string
          ende: string | null
          geraet_zeitpunkt: string | null
          id: string
          minuten: number | null
          pflueckaufgabe_id: string | null
          pfluecker_id: string
          server_eingang_zeitpunkt: string | null
        }
        Insert: {
          beginn: string
          created_at?: string
          ende?: string | null
          geraet_zeitpunkt?: string | null
          id?: string
          minuten?: number | null
          pflueckaufgabe_id?: string | null
          pfluecker_id: string
          server_eingang_zeitpunkt?: string | null
        }
        Update: {
          beginn?: string
          created_at?: string
          ende?: string | null
          geraet_zeitpunkt?: string | null
          id?: string
          minuten?: number | null
          pflueckaufgabe_id?: string | null
          pfluecker_id?: string
          server_eingang_zeitpunkt?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "arbeitszeiten_pflueckaufgabe_id_fkey"
            columns: ["pflueckaufgabe_id"]
            isOneToOne: false
            referencedRelation: "pflueckaufgaben"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arbeitszeiten_pfluecker_id_fkey"
            columns: ["pfluecker_id"]
            isOneToOne: false
            referencedRelation: "pfluecker"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          actor: string | null
          aktion: string
          bereich: Database["public"]["Enums"]["audit_bereich"] | null
          created_at: string
          id: string
          metadata: Json
          ressource: string
          ressource_id: string | null
        }
        Insert: {
          actor?: string | null
          aktion: string
          bereich?: Database["public"]["Enums"]["audit_bereich"] | null
          created_at?: string
          id?: string
          metadata?: Json
          ressource: string
          ressource_id?: string | null
        }
        Update: {
          actor?: string | null
          aktion?: string
          bereich?: Database["public"]["Enums"]["audit_bereich"] | null
          created_at?: string
          id?: string
          metadata?: Json
          ressource?: string
          ressource_id?: string | null
        }
        Relationships: []
      }
      b2b_kunden: {
        Row: {
          adresse: string | null
          breitengrad: number | null
          created_at: string
          geokodiert_am: string | null
          id: string
          identifikationsnummer: string | null
          identitaets_digest: string | null
          kontakt: string | null
          kundengruppe: Database["public"]["Enums"]["kundengruppe"] | null
          laengengrad: number | null
          name: string
          rechtsform: Database["public"]["Enums"]["rechtsform"] | null
          updated_at: string
        }
        Insert: {
          adresse?: string | null
          breitengrad?: number | null
          created_at?: string
          geokodiert_am?: string | null
          id?: string
          identifikationsnummer?: string | null
          identitaets_digest?: string | null
          kontakt?: string | null
          kundengruppe?: Database["public"]["Enums"]["kundengruppe"] | null
          laengengrad?: number | null
          name: string
          rechtsform?: Database["public"]["Enums"]["rechtsform"] | null
          updated_at?: string
        }
        Update: {
          adresse?: string | null
          breitengrad?: number | null
          created_at?: string
          geokodiert_am?: string | null
          id?: string
          identifikationsnummer?: string | null
          identitaets_digest?: string | null
          kontakt?: string | null
          kundengruppe?: Database["public"]["Enums"]["kundengruppe"] | null
          laengengrad?: number | null
          name?: string
          rechtsform?: Database["public"]["Enums"]["rechtsform"] | null
          updated_at?: string
        }
        Relationships: []
      }
      betriebe: {
        Row: {
          created_at: string
          id: string
          identifikationsnummer: string | null
          name: string
          rechtsform: Database["public"]["Enums"]["rechtsform"] | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          identifikationsnummer?: string | null
          name: string
          rechtsform?: Database["public"]["Enums"]["rechtsform"] | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          identifikationsnummer?: string | null
          name?: string
          rechtsform?: Database["public"]["Enums"]["rechtsform"] | null
          updated_at?: string
        }
        Relationships: []
      }
      brigaden: {
        Row: {
          created_at: string
          id: string
          name: string
          plantage_id: string | null
          staerke: number
          updated_at: string
          vorarbeiter: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          plantage_id?: string | null
          staerke?: number
          updated_at?: string
          vorarbeiter?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          plantage_id?: string | null
          staerke?: number
          updated_at?: string
          vorarbeiter?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brigaden_plantage_id_fkey"
            columns: ["plantage_id"]
            isOneToOne: false
            referencedRelation: "plantagen"
            referencedColumns: ["id"]
          },
        ]
      }
      chargen: {
        Row: {
          ausschuss_kg: number
          code: string
          created_at: string
          ernte_datum: string
          id: string
          menge_kg: number
          oeffentlicher_code: string
          pflueck_zeitpunkt: string | null
          pflueckaufgabe_id: string | null
          reihenblock_id: string | null
          sorte_id: string | null
          status: Database["public"]["Enums"]["charge_status"]
          updated_at: string
          vorkuehlung_zeitpunkt: string | null
        }
        Insert: {
          ausschuss_kg?: number
          code: string
          created_at?: string
          ernte_datum?: string
          id?: string
          menge_kg?: number
          oeffentlicher_code?: string
          pflueck_zeitpunkt?: string | null
          pflueckaufgabe_id?: string | null
          reihenblock_id?: string | null
          sorte_id?: string | null
          status?: Database["public"]["Enums"]["charge_status"]
          updated_at?: string
          vorkuehlung_zeitpunkt?: string | null
        }
        Update: {
          ausschuss_kg?: number
          code?: string
          created_at?: string
          ernte_datum?: string
          id?: string
          menge_kg?: number
          oeffentlicher_code?: string
          pflueck_zeitpunkt?: string | null
          pflueckaufgabe_id?: string | null
          reihenblock_id?: string | null
          sorte_id?: string | null
          status?: Database["public"]["Enums"]["charge_status"]
          updated_at?: string
          vorkuehlung_zeitpunkt?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chargen_pflueckaufgabe_id_fkey"
            columns: ["pflueckaufgabe_id"]
            isOneToOne: false
            referencedRelation: "pflueckaufgaben"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chargen_reihenblock_id_fkey"
            columns: ["reihenblock_id"]
            isOneToOne: false
            referencedRelation: "reihenbloecke"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chargen_sorte_id_fkey"
            columns: ["sorte_id"]
            isOneToOne: false
            referencedRelation: "sorten"
            referencedColumns: ["id"]
          },
        ]
      }
      datenschutzvorfaelle: {
        Row: {
          art: Database["public"]["Enums"]["vorfall_art"]
          behoben_am: string | null
          beschreibung: string
          betroffene_anzahl: number | null
          created_at: string
          festgestellt_am: string
          gemeldet_am: string | null
          id: string
          meldefrist_am: string | null
          meldereferenz: string | null
          updated_at: string
          verantwortlich_profil_id: string | null
        }
        Insert: {
          art: Database["public"]["Enums"]["vorfall_art"]
          behoben_am?: string | null
          beschreibung: string
          betroffene_anzahl?: number | null
          created_at?: string
          festgestellt_am: string
          gemeldet_am?: string | null
          id?: string
          meldefrist_am?: string | null
          meldereferenz?: string | null
          updated_at?: string
          verantwortlich_profil_id?: string | null
        }
        Update: {
          art?: Database["public"]["Enums"]["vorfall_art"]
          behoben_am?: string | null
          beschreibung?: string
          betroffene_anzahl?: number | null
          created_at?: string
          festgestellt_am?: string
          gemeldet_am?: string | null
          id?: string
          meldefrist_am?: string | null
          meldereferenz?: string | null
          updated_at?: string
          verantwortlich_profil_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "datenschutzvorfaelle_verantwortlich_profil_id_fkey"
            columns: ["verantwortlich_profil_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "datenschutzvorfaelle_verantwortlich_profil_id_fkey"
            columns: ["verantwortlich_profil_id"]
            isOneToOne: false
            referencedRelation: "schulungsteilnahmen_status"
            referencedColumns: ["profil_id"]
          },
        ]
      }
      dokumente: {
        Row: {
          bezug: string | null
          charge_id: string | null
          created_at: string
          foerderdossier_id: string | null
          id: string
          kategorie: Database["public"]["Enums"]["dokument_kategorie"]
          name: string
          reihenblock_id: string | null
          stand: string | null
          status: Database["public"]["Enums"]["dokument_status"]
          storage_path: string | null
          updated_at: string
        }
        Insert: {
          bezug?: string | null
          charge_id?: string | null
          created_at?: string
          foerderdossier_id?: string | null
          id?: string
          kategorie?: Database["public"]["Enums"]["dokument_kategorie"]
          name: string
          reihenblock_id?: string | null
          stand?: string | null
          status?: Database["public"]["Enums"]["dokument_status"]
          storage_path?: string | null
          updated_at?: string
        }
        Update: {
          bezug?: string | null
          charge_id?: string | null
          created_at?: string
          foerderdossier_id?: string | null
          id?: string
          kategorie?: Database["public"]["Enums"]["dokument_kategorie"]
          name?: string
          reihenblock_id?: string | null
          stand?: string | null
          status?: Database["public"]["Enums"]["dokument_status"]
          storage_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dokumente_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "chargen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dokumente_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "deckungsbeitrag_je_charge"
            referencedColumns: ["charge_id"]
          },
          {
            foreignKeyName: "dokumente_foerderdossier_id_fkey"
            columns: ["foerderdossier_id"]
            isOneToOne: false
            referencedRelation: "foerderdossiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dokumente_reihenblock_id_fkey"
            columns: ["reihenblock_id"]
            isOneToOne: false
            referencedRelation: "reihenbloecke"
            referencedColumns: ["id"]
          },
        ]
      }
      drittweitergaben: {
        Row: {
          benachrichtigt_am: string | null
          benachrichtigungsfrist_am: string | null
          betroffener_b2b_kunde_id: string | null
          betroffener_pfluecker_id: string | null
          betroffener_profil_id: string | null
          created_at: string
          empfaenger: string
          id: string
          updated_at: string
          weitergegeben_am: string
          zweck_id: string | null
        }
        Insert: {
          benachrichtigt_am?: string | null
          benachrichtigungsfrist_am?: string | null
          betroffener_b2b_kunde_id?: string | null
          betroffener_pfluecker_id?: string | null
          betroffener_profil_id?: string | null
          created_at?: string
          empfaenger: string
          id?: string
          updated_at?: string
          weitergegeben_am?: string
          zweck_id?: string | null
        }
        Update: {
          benachrichtigt_am?: string | null
          benachrichtigungsfrist_am?: string | null
          betroffener_b2b_kunde_id?: string | null
          betroffener_pfluecker_id?: string | null
          betroffener_profil_id?: string | null
          created_at?: string
          empfaenger?: string
          id?: string
          updated_at?: string
          weitergegeben_am?: string
          zweck_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drittweitergaben_betroffener_b2b_kunde_id_fkey"
            columns: ["betroffener_b2b_kunde_id"]
            isOneToOne: false
            referencedRelation: "b2b_kunden"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drittweitergaben_betroffener_pfluecker_id_fkey"
            columns: ["betroffener_pfluecker_id"]
            isOneToOne: false
            referencedRelation: "pfluecker"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drittweitergaben_betroffener_profil_id_fkey"
            columns: ["betroffener_profil_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drittweitergaben_betroffener_profil_id_fkey"
            columns: ["betroffener_profil_id"]
            isOneToOne: false
            referencedRelation: "schulungsteilnahmen_status"
            referencedColumns: ["profil_id"]
          },
          {
            foreignKeyName: "drittweitergaben_zweck_id_fkey"
            columns: ["zweck_id"]
            isOneToOne: false
            referencedRelation: "verarbeitungszwecke"
            referencedColumns: ["id"]
          },
        ]
      }
      einarbeitung_fortschritt: {
        Row: {
          created_at: string
          erledigt_am: string
          id: string
          pfluecker_id: string
          schritt_id: string
        }
        Insert: {
          created_at?: string
          erledigt_am?: string
          id?: string
          pfluecker_id: string
          schritt_id: string
        }
        Update: {
          created_at?: string
          erledigt_am?: string
          id?: string
          pfluecker_id?: string
          schritt_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "einarbeitung_fortschritt_pfluecker_id_fkey"
            columns: ["pfluecker_id"]
            isOneToOne: false
            referencedRelation: "pfluecker"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "einarbeitung_fortschritt_schritt_id_fkey"
            columns: ["schritt_id"]
            isOneToOne: false
            referencedRelation: "einarbeitung_schritte"
            referencedColumns: ["id"]
          },
        ]
      }
      einarbeitung_schritte: {
        Row: {
          beschreibung: Json
          created_at: string
          icon: string
          id: string
          reihenfolge: number
          titel: Json
          updated_at: string
        }
        Insert: {
          beschreibung: Json
          created_at?: string
          icon: string
          id?: string
          reihenfolge: number
          titel: Json
          updated_at?: string
        }
        Update: {
          beschreibung?: Json
          created_at?: string
          icon?: string
          id?: string
          reihenfolge?: number
          titel?: Json
          updated_at?: string
        }
        Relationships: []
      }
      einwilligungen: {
        Row: {
          betroffener_b2b_kunde_id: string | null
          betroffener_pfluecker_id: string | null
          betroffener_profil_id: string | null
          created_at: string
          erteilt_am: string
          id: string
          kanal: Database["public"]["Enums"]["einwilligung_kanal"]
          nachweis_referenz: string | null
          sprache: string
          textfassung: string
          widerruf_grund: string | null
          widerrufen_am: string | null
          zweck_id: string
        }
        Insert: {
          betroffener_b2b_kunde_id?: string | null
          betroffener_pfluecker_id?: string | null
          betroffener_profil_id?: string | null
          created_at?: string
          erteilt_am?: string
          id?: string
          kanal: Database["public"]["Enums"]["einwilligung_kanal"]
          nachweis_referenz?: string | null
          sprache?: string
          textfassung: string
          widerruf_grund?: string | null
          widerrufen_am?: string | null
          zweck_id: string
        }
        Update: {
          betroffener_b2b_kunde_id?: string | null
          betroffener_pfluecker_id?: string | null
          betroffener_profil_id?: string | null
          created_at?: string
          erteilt_am?: string
          id?: string
          kanal?: Database["public"]["Enums"]["einwilligung_kanal"]
          nachweis_referenz?: string | null
          sprache?: string
          textfassung?: string
          widerruf_grund?: string | null
          widerrufen_am?: string | null
          zweck_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "einwilligungen_betroffener_b2b_kunde_id_fkey"
            columns: ["betroffener_b2b_kunde_id"]
            isOneToOne: false
            referencedRelation: "b2b_kunden"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "einwilligungen_betroffener_pfluecker_id_fkey"
            columns: ["betroffener_pfluecker_id"]
            isOneToOne: false
            referencedRelation: "pfluecker"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "einwilligungen_betroffener_profil_id_fkey"
            columns: ["betroffener_profil_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "einwilligungen_betroffener_profil_id_fkey"
            columns: ["betroffener_profil_id"]
            isOneToOne: false
            referencedRelation: "schulungsteilnahmen_status"
            referencedColumns: ["profil_id"]
          },
          {
            foreignKeyName: "einwilligungen_zweck_id_fkey"
            columns: ["zweck_id"]
            isOneToOne: false
            referencedRelation: "verarbeitungszwecke"
            referencedColumns: ["id"]
          },
        ]
      }
      esutd_vertraege: {
        Row: {
          created_at: string
          erfasst_am: string | null
          id: string
          outbox_id: string | null
          pfluecker_id: string
          status: Database["public"]["Enums"]["esutd_status"]
          vertragsnummer: string | null
        }
        Insert: {
          created_at?: string
          erfasst_am?: string | null
          id?: string
          outbox_id?: string | null
          pfluecker_id: string
          status?: Database["public"]["Enums"]["esutd_status"]
          vertragsnummer?: string | null
        }
        Update: {
          created_at?: string
          erfasst_am?: string | null
          id?: string
          outbox_id?: string | null
          pfluecker_id?: string
          status?: Database["public"]["Enums"]["esutd_status"]
          vertragsnummer?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "esutd_vertraege_pfluecker_id_fkey"
            columns: ["pfluecker_id"]
            isOneToOne: false
            referencedRelation: "pfluecker"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_esutd_outbox"
            columns: ["outbox_id"]
            isOneToOne: false
            referencedRelation: "integration_outbox"
            referencedColumns: ["id"]
          },
        ]
      }
      feldparzellen: {
        Row: {
          created_at: string
          flaeche_ha: number | null
          id: string
          name: string
          plantage_id: string
          sorte_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          flaeche_ha?: number | null
          id?: string
          name: string
          plantage_id: string
          sorte_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          flaeche_ha?: number | null
          id?: string
          name?: string
          plantage_id?: string
          sorte_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "feldparzellen_plantage_id_fkey"
            columns: ["plantage_id"]
            isOneToOne: false
            referencedRelation: "plantagen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feldparzellen_sorte_id_fkey"
            columns: ["sorte_id"]
            isOneToOne: false
            referencedRelation: "sorten"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_ledger_entries: {
        Row: {
          beschreibung: string | null
          betrag_tenge: number
          buchungsdatum: string
          charge_id: string | null
          created_at: string
          id: string
          kategorie: string
          kostentraeger_id: string | null
          typ: Database["public"]["Enums"]["ledger_typ"]
        }
        Insert: {
          beschreibung?: string | null
          betrag_tenge: number
          buchungsdatum?: string
          charge_id?: string | null
          created_at?: string
          id?: string
          kategorie: string
          kostentraeger_id?: string | null
          typ: Database["public"]["Enums"]["ledger_typ"]
        }
        Update: {
          beschreibung?: string | null
          betrag_tenge?: number
          buchungsdatum?: string
          charge_id?: string | null
          created_at?: string
          id?: string
          kategorie?: string
          kostentraeger_id?: string | null
          typ?: Database["public"]["Enums"]["ledger_typ"]
        }
        Relationships: [
          {
            foreignKeyName: "finance_ledger_entries_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "chargen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_ledger_entries_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "deckungsbeitrag_je_charge"
            referencedColumns: ["charge_id"]
          },
          {
            foreignKeyName: "finance_ledger_entries_kostentraeger_id_fkey"
            columns: ["kostentraeger_id"]
            isOneToOne: false
            referencedRelation: "deckungsbeitrag_je_kostentraeger"
            referencedColumns: ["kostentraeger_id"]
          },
          {
            foreignKeyName: "finance_ledger_entries_kostentraeger_id_fkey"
            columns: ["kostentraeger_id"]
            isOneToOne: false
            referencedRelation: "kostentraeger"
            referencedColumns: ["id"]
          },
        ]
      }
      foerderdossiers: {
        Row: {
          antragsnummer: string | null
          created_at: string
          eingereicht_am: string | null
          frist_am: string | null
          id: string
          notizen: string | null
          portal: string
          status: string
          titel: string
          updated_at: string
        }
        Insert: {
          antragsnummer?: string | null
          created_at?: string
          eingereicht_am?: string | null
          frist_am?: string | null
          id?: string
          notizen?: string | null
          portal: string
          status?: string
          titel: string
          updated_at?: string
        }
        Update: {
          antragsnummer?: string | null
          created_at?: string
          eingereicht_am?: string | null
          frist_am?: string | null
          id?: string
          notizen?: string | null
          portal?: string
          status?: string
          titel?: string
          updated_at?: string
        }
        Relationships: []
      }
      integration_outbox: {
        Row: {
          created_at: string
          id: string
          letzter_fehler: string | null
          payload: Json
          richtung: string
          status: Database["public"]["Enums"]["outbox_status"]
          updated_at: string
          verarbeitet_am: string | null
          versuche: number
          ziel_system: string
        }
        Insert: {
          created_at?: string
          id?: string
          letzter_fehler?: string | null
          payload?: Json
          richtung?: string
          status?: Database["public"]["Enums"]["outbox_status"]
          updated_at?: string
          verarbeitet_am?: string | null
          versuche?: number
          ziel_system: string
        }
        Update: {
          created_at?: string
          id?: string
          letzter_fehler?: string | null
          payload?: Json
          richtung?: string
          status?: Database["public"]["Enums"]["outbox_status"]
          updated_at?: string
          verarbeitet_am?: string | null
          versuche?: number
          ziel_system?: string
        }
        Relationships: []
      }
      integrationen: {
        Row: {
          created_at: string
          id: string
          key: string
          name: string
          status: Database["public"]["Enums"]["integration_status"]
          system: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          name: string
          status?: Database["public"]["Enums"]["integration_status"]
          system: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          name?: string
          status?: Database["public"]["Enums"]["integration_status"]
          system?: string
          updated_at?: string
        }
        Relationships: []
      }
      ki_anbieter: {
        Row: {
          aktiv: boolean
          aktualisiert_am: string
          anzeige_name: string
          api_key_chiffrat: string
          basis_url: string
          erstellt_am: string
          erstellt_von: string | null
          id: string
          ist_standard: boolean
          modell: string
          name: string
          typ: Database["public"]["Enums"]["ki_anbieter_typ"]
        }
        Insert: {
          aktiv?: boolean
          aktualisiert_am?: string
          anzeige_name: string
          api_key_chiffrat: string
          basis_url: string
          erstellt_am?: string
          erstellt_von?: string | null
          id?: string
          ist_standard?: boolean
          modell: string
          name: string
          typ: Database["public"]["Enums"]["ki_anbieter_typ"]
        }
        Update: {
          aktiv?: boolean
          aktualisiert_am?: string
          anzeige_name?: string
          api_key_chiffrat?: string
          basis_url?: string
          erstellt_am?: string
          erstellt_von?: string | null
          id?: string
          ist_standard?: boolean
          modell?: string
          name?: string
          typ?: Database["public"]["Enums"]["ki_anbieter_typ"]
        }
        Relationships: [
          {
            foreignKeyName: "ki_anbieter_erstellt_von_fkey"
            columns: ["erstellt_von"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ki_anbieter_erstellt_von_fkey"
            columns: ["erstellt_von"]
            isOneToOne: false
            referencedRelation: "schulungsteilnahmen_status"
            referencedColumns: ["profil_id"]
          },
        ]
      }
      ki_chat_nachrichten: {
        Row: {
          anbieter_name: string | null
          erstellt_am: string
          eskaliert: boolean
          fallback: boolean
          id: string
          inhalt: string
          profil_id: string
          rolle: string
        }
        Insert: {
          anbieter_name?: string | null
          erstellt_am?: string
          eskaliert?: boolean
          fallback?: boolean
          id?: string
          inhalt: string
          profil_id: string
          rolle: string
        }
        Update: {
          anbieter_name?: string | null
          erstellt_am?: string
          eskaliert?: boolean
          fallback?: boolean
          id?: string
          inhalt?: string
          profil_id?: string
          rolle?: string
        }
        Relationships: [
          {
            foreignKeyName: "ki_chat_nachrichten_profil_id_fkey"
            columns: ["profil_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ki_chat_nachrichten_profil_id_fkey"
            columns: ["profil_id"]
            isOneToOne: false
            referencedRelation: "schulungsteilnahmen_status"
            referencedColumns: ["profil_id"]
          },
        ]
      }
      kontaktkanaele: {
        Row: {
          aktiv: boolean
          bezeichnung: string
          created_at: string
          id: string
          reihenfolge: number
          typ: Database["public"]["Enums"]["kontaktkanal_typ"]
          updated_at: string
          wert: string | null
        }
        Insert: {
          aktiv?: boolean
          bezeichnung: string
          created_at?: string
          id?: string
          reihenfolge?: number
          typ: Database["public"]["Enums"]["kontaktkanal_typ"]
          updated_at?: string
          wert?: string | null
        }
        Update: {
          aktiv?: boolean
          bezeichnung?: string
          created_at?: string
          id?: string
          reihenfolge?: number
          typ?: Database["public"]["Enums"]["kontaktkanal_typ"]
          updated_at?: string
          wert?: string | null
        }
        Relationships: []
      }
      kontingente: {
        Row: {
          b2b_kunde_id: string | null
          created_at: string
          id: string
          menge_kg: number
          reserviert_kg: number
          saison: string | null
          sorte_id: string
          updated_at: string
        }
        Insert: {
          b2b_kunde_id?: string | null
          created_at?: string
          id?: string
          menge_kg?: number
          reserviert_kg?: number
          saison?: string | null
          sorte_id: string
          updated_at?: string
        }
        Update: {
          b2b_kunde_id?: string | null
          created_at?: string
          id?: string
          menge_kg?: number
          reserviert_kg?: number
          saison?: string | null
          sorte_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kontingente_b2b_kunde_id_fkey"
            columns: ["b2b_kunde_id"]
            isOneToOne: false
            referencedRelation: "b2b_kunden"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kontingente_sorte_id_fkey"
            columns: ["sorte_id"]
            isOneToOne: false
            referencedRelation: "sorten"
            referencedColumns: ["id"]
          },
        ]
      }
      kostentraeger: {
        Row: {
          b2b_kunde_id: string | null
          bezeichnung: string
          created_at: string
          erntetag: string | null
          id: string
          reihenblock_id: string | null
          sorte_id: string | null
        }
        Insert: {
          b2b_kunde_id?: string | null
          bezeichnung: string
          created_at?: string
          erntetag?: string | null
          id?: string
          reihenblock_id?: string | null
          sorte_id?: string | null
        }
        Update: {
          b2b_kunde_id?: string | null
          bezeichnung?: string
          created_at?: string
          erntetag?: string | null
          id?: string
          reihenblock_id?: string | null
          sorte_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kostentraeger_b2b_kunde_id_fkey"
            columns: ["b2b_kunde_id"]
            isOneToOne: false
            referencedRelation: "b2b_kunden"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kostentraeger_reihenblock_id_fkey"
            columns: ["reihenblock_id"]
            isOneToOne: false
            referencedRelation: "reihenbloecke"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kostentraeger_sorte_id_fkey"
            columns: ["sorte_id"]
            isOneToOne: false
            referencedRelation: "sorten"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_baseline: {
        Row: {
          baseline_wert: string | null
          created_at: string
          gut_richtung: string
          id: string
          key: string
          name: string
          unterschrieben_am: string | null
          updated_at: string
          ziel: string | null
          zone: string
        }
        Insert: {
          baseline_wert?: string | null
          created_at?: string
          gut_richtung?: string
          id?: string
          key: string
          name: string
          unterschrieben_am?: string | null
          updated_at?: string
          ziel?: string | null
          zone: string
        }
        Update: {
          baseline_wert?: string | null
          created_at?: string
          gut_richtung?: string
          id?: string
          key?: string
          name?: string
          unterschrieben_am?: string | null
          updated_at?: string
          ziel?: string | null
          zone?: string
        }
        Relationships: []
      }
      kuehlketten_messungen: {
        Row: {
          charge_id: string
          created_at: string
          ergebnis: Database["public"]["Enums"]["kuehlkette_ergebnis"]
          gemessen_am: string
          geraet_zeitpunkt: string | null
          id: string
          minuten_seit_pfluecken: number | null
          server_eingang_zeitpunkt: string | null
          temperatur_c: number
        }
        Insert: {
          charge_id: string
          created_at?: string
          ergebnis?: Database["public"]["Enums"]["kuehlkette_ergebnis"]
          gemessen_am: string
          geraet_zeitpunkt?: string | null
          id?: string
          minuten_seit_pfluecken?: number | null
          server_eingang_zeitpunkt?: string | null
          temperatur_c: number
        }
        Update: {
          charge_id?: string
          created_at?: string
          ergebnis?: Database["public"]["Enums"]["kuehlkette_ergebnis"]
          gemessen_am?: string
          geraet_zeitpunkt?: string | null
          id?: string
          minuten_seit_pfluecken?: number | null
          server_eingang_zeitpunkt?: string | null
          temperatur_c?: number
        }
        Relationships: [
          {
            foreignKeyName: "kuehlketten_messungen_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "chargen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kuehlketten_messungen_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "deckungsbeitrag_je_charge"
            referencedColumns: ["charge_id"]
          },
        ]
      }
      kundeneinladungen: {
        Row: {
          b2b_kunde_id: string
          code_digest: string
          created_at: string
          eingeloest_am: string | null
          eingeloest_profil_id: string | null
          email: string
          erstellt_von_profil_id: string | null
          full_name: string
          gueltig_bis: string
          id: string
          status: Database["public"]["Enums"]["einladung_status"]
          updated_at: string
        }
        Insert: {
          b2b_kunde_id: string
          code_digest: string
          created_at?: string
          eingeloest_am?: string | null
          eingeloest_profil_id?: string | null
          email: string
          erstellt_von_profil_id?: string | null
          full_name: string
          gueltig_bis: string
          id?: string
          status?: Database["public"]["Enums"]["einladung_status"]
          updated_at?: string
        }
        Update: {
          b2b_kunde_id?: string
          code_digest?: string
          created_at?: string
          eingeloest_am?: string | null
          eingeloest_profil_id?: string | null
          email?: string
          erstellt_von_profil_id?: string | null
          full_name?: string
          gueltig_bis?: string
          id?: string
          status?: Database["public"]["Enums"]["einladung_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kundeneinladungen_b2b_kunde_id_fkey"
            columns: ["b2b_kunde_id"]
            isOneToOne: false
            referencedRelation: "b2b_kunden"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kundeneinladungen_eingeloest_profil_id_fkey"
            columns: ["eingeloest_profil_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kundeneinladungen_eingeloest_profil_id_fkey"
            columns: ["eingeloest_profil_id"]
            isOneToOne: false
            referencedRelation: "schulungsteilnahmen_status"
            referencedColumns: ["profil_id"]
          },
          {
            foreignKeyName: "kundeneinladungen_erstellt_von_profil_id_fkey"
            columns: ["erstellt_von_profil_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kundeneinladungen_erstellt_von_profil_id_fkey"
            columns: ["erstellt_von_profil_id"]
            isOneToOne: false
            referencedRelation: "schulungsteilnahmen_status"
            referencedColumns: ["profil_id"]
          },
        ]
      }
      lieferungen: {
        Row: {
          abgezeichnet_von_profil_id: string | null
          b2b_kunde_id: string
          beleg_storage_path: string | null
          charge_id: string | null
          created_at: string
          empfaenger_name: string | null
          geliefert_am: string | null
          geraet_zeitpunkt: string | null
          id: string
          lieferschein_outbox_id: string | null
          menge_kg: number
          server_eingang_zeitpunkt: string | null
          status: Database["public"]["Enums"]["lieferung_status"]
          tour_id: string | null
          tour_reihenfolge: number | null
          vorbestellung_id: string | null
        }
        Insert: {
          abgezeichnet_von_profil_id?: string | null
          b2b_kunde_id: string
          beleg_storage_path?: string | null
          charge_id?: string | null
          created_at?: string
          empfaenger_name?: string | null
          geliefert_am?: string | null
          geraet_zeitpunkt?: string | null
          id?: string
          lieferschein_outbox_id?: string | null
          menge_kg?: number
          server_eingang_zeitpunkt?: string | null
          status?: Database["public"]["Enums"]["lieferung_status"]
          tour_id?: string | null
          tour_reihenfolge?: number | null
          vorbestellung_id?: string | null
        }
        Update: {
          abgezeichnet_von_profil_id?: string | null
          b2b_kunde_id?: string
          beleg_storage_path?: string | null
          charge_id?: string | null
          created_at?: string
          empfaenger_name?: string | null
          geliefert_am?: string | null
          geraet_zeitpunkt?: string | null
          id?: string
          lieferschein_outbox_id?: string | null
          menge_kg?: number
          server_eingang_zeitpunkt?: string | null
          status?: Database["public"]["Enums"]["lieferung_status"]
          tour_id?: string | null
          tour_reihenfolge?: number | null
          vorbestellung_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_lieferung_outbox"
            columns: ["lieferschein_outbox_id"]
            isOneToOne: false
            referencedRelation: "integration_outbox"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lieferungen_abgezeichnet_von_profil_id_fkey"
            columns: ["abgezeichnet_von_profil_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lieferungen_abgezeichnet_von_profil_id_fkey"
            columns: ["abgezeichnet_von_profil_id"]
            isOneToOne: false
            referencedRelation: "schulungsteilnahmen_status"
            referencedColumns: ["profil_id"]
          },
          {
            foreignKeyName: "lieferungen_b2b_kunde_id_fkey"
            columns: ["b2b_kunde_id"]
            isOneToOne: false
            referencedRelation: "b2b_kunden"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lieferungen_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "chargen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lieferungen_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "deckungsbeitrag_je_charge"
            referencedColumns: ["charge_id"]
          },
          {
            foreignKeyName: "lieferungen_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "touren"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lieferungen_vorbestellung_id_fkey"
            columns: ["vorbestellung_id"]
            isOneToOne: false
            referencedRelation: "vorbestellungen"
            referencedColumns: ["id"]
          },
        ]
      }
      lohn_abrechnungen: {
        Row: {
          ausschussquote: number | null
          created_at: string
          gesamt_tenge: number
          grundlohn_tenge: number
          id: string
          menge_kg: number
          mengen_komponente_tenge: number
          periode_ende: string
          periode_start: string
          pfluecker_id: string
          qualitaetsfaktor: number
          status: Database["public"]["Enums"]["lohn_status"]
          stunden: number
          updated_at: string
        }
        Insert: {
          ausschussquote?: number | null
          created_at?: string
          gesamt_tenge?: number
          grundlohn_tenge?: number
          id?: string
          menge_kg?: number
          mengen_komponente_tenge?: number
          periode_ende: string
          periode_start: string
          pfluecker_id: string
          qualitaetsfaktor?: number
          status?: Database["public"]["Enums"]["lohn_status"]
          stunden?: number
          updated_at?: string
        }
        Update: {
          ausschussquote?: number | null
          created_at?: string
          gesamt_tenge?: number
          grundlohn_tenge?: number
          id?: string
          menge_kg?: number
          mengen_komponente_tenge?: number
          periode_ende?: string
          periode_start?: string
          pfluecker_id?: string
          qualitaetsfaktor?: number
          status?: Database["public"]["Enums"]["lohn_status"]
          stunden?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lohn_abrechnungen_pfluecker_id_fkey"
            columns: ["pfluecker_id"]
            isOneToOne: false
            referencedRelation: "pfluecker"
            referencedColumns: ["id"]
          },
        ]
      }
      lohn_positionen: {
        Row: {
          ausschuss_anteilig_kg: number
          betrag_tenge: number
          created_at: string
          id: string
          lohn_abrechnung_id: string
          menge_kg: number
          pflueckaufgabe_id: string | null
          qualitaetsfaktor: number
        }
        Insert: {
          ausschuss_anteilig_kg?: number
          betrag_tenge?: number
          created_at?: string
          id?: string
          lohn_abrechnung_id: string
          menge_kg?: number
          pflueckaufgabe_id?: string | null
          qualitaetsfaktor?: number
        }
        Update: {
          ausschuss_anteilig_kg?: number
          betrag_tenge?: number
          created_at?: string
          id?: string
          lohn_abrechnung_id?: string
          menge_kg?: number
          pflueckaufgabe_id?: string | null
          qualitaetsfaktor?: number
        }
        Relationships: [
          {
            foreignKeyName: "lohn_positionen_lohn_abrechnung_id_fkey"
            columns: ["lohn_abrechnung_id"]
            isOneToOne: false
            referencedRelation: "lohn_abrechnungen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lohn_positionen_pflueckaufgabe_id_fkey"
            columns: ["pflueckaufgabe_id"]
            isOneToOne: false
            referencedRelation: "pflueckaufgaben"
            referencedColumns: ["id"]
          },
        ]
      }
      lohn_saetze: {
        Row: {
          created_at: string
          gueltig_ab: string
          gueltig_bis: string | null
          id: string
          kg_satz_tenge: number
          notiz: string | null
          qualitaets_ziel_ausschussquote: number
          qualitaetsfaktor_max: number
          qualitaetsfaktor_min: number
          stundenlohn_tenge: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          gueltig_ab?: string
          gueltig_bis?: string | null
          id?: string
          kg_satz_tenge: number
          notiz?: string | null
          qualitaets_ziel_ausschussquote?: number
          qualitaetsfaktor_max?: number
          qualitaetsfaktor_min?: number
          stundenlohn_tenge: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          gueltig_ab?: string
          gueltig_bis?: string | null
          id?: string
          kg_satz_tenge?: number
          notiz?: string | null
          qualitaets_ziel_ausschussquote?: number
          qualitaetsfaktor_max?: number
          qualitaetsfaktor_min?: number
          stundenlohn_tenge?: number
          updated_at?: string
        }
        Relationships: []
      }
      media_belege: {
        Row: {
          art: Database["public"]["Enums"]["beleg_art"]
          aufgenommen_am: string
          created_at: string
          digest: string | null
          geraet_zeitpunkt: string | null
          hinweis: string | null
          id: string
          pflueckaufgabe_id: string
          server_eingang_zeitpunkt: string | null
          storage_path: string | null
        }
        Insert: {
          art: Database["public"]["Enums"]["beleg_art"]
          aufgenommen_am: string
          created_at?: string
          digest?: string | null
          geraet_zeitpunkt?: string | null
          hinweis?: string | null
          id?: string
          pflueckaufgabe_id: string
          server_eingang_zeitpunkt?: string | null
          storage_path?: string | null
        }
        Update: {
          art?: Database["public"]["Enums"]["beleg_art"]
          aufgenommen_am?: string
          created_at?: string
          digest?: string | null
          geraet_zeitpunkt?: string | null
          hinweis?: string | null
          id?: string
          pflueckaufgabe_id?: string
          server_eingang_zeitpunkt?: string | null
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "media_belege_pflueckaufgabe_id_fkey"
            columns: ["pflueckaufgabe_id"]
            isOneToOne: false
            referencedRelation: "pflueckaufgaben"
            referencedColumns: ["id"]
          },
        ]
      }
      nachbarbetriebe: {
        Row: {
          created_at: string
          id: string
          identifikationsnummer: string | null
          identitaets_digest: string | null
          kontakt: string | null
          name: string
          ort: string | null
          rechtsform: Database["public"]["Enums"]["rechtsform"] | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          identifikationsnummer?: string | null
          identitaets_digest?: string | null
          kontakt?: string | null
          name: string
          ort?: string | null
          rechtsform?: Database["public"]["Enums"]["rechtsform"] | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          identifikationsnummer?: string | null
          identitaets_digest?: string | null
          kontakt?: string | null
          name?: string
          ort?: string | null
          rechtsform?: Database["public"]["Enums"]["rechtsform"] | null
          updated_at?: string
        }
        Relationships: []
      }
      personenbezogene_zugriffe: {
        Row: {
          akteur_id: string | null
          aktion: Database["public"]["Enums"]["zugriffsaktion"]
          betroffener_b2b_kunde_id: string | null
          betroffener_pfluecker_id: string | null
          betroffener_profil_id: string | null
          client_info: string | null
          entitaet: string
          entitaet_id: string | null
          id: string
          stattgefunden_am: string
          zweck_id: string | null
        }
        Insert: {
          akteur_id?: string | null
          aktion: Database["public"]["Enums"]["zugriffsaktion"]
          betroffener_b2b_kunde_id?: string | null
          betroffener_pfluecker_id?: string | null
          betroffener_profil_id?: string | null
          client_info?: string | null
          entitaet: string
          entitaet_id?: string | null
          id?: string
          stattgefunden_am?: string
          zweck_id?: string | null
        }
        Update: {
          akteur_id?: string | null
          aktion?: Database["public"]["Enums"]["zugriffsaktion"]
          betroffener_b2b_kunde_id?: string | null
          betroffener_pfluecker_id?: string | null
          betroffener_profil_id?: string | null
          client_info?: string | null
          entitaet?: string
          entitaet_id?: string | null
          id?: string
          stattgefunden_am?: string
          zweck_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "personenbezogene_zugriffe_akteur_id_fkey"
            columns: ["akteur_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personenbezogene_zugriffe_akteur_id_fkey"
            columns: ["akteur_id"]
            isOneToOne: false
            referencedRelation: "schulungsteilnahmen_status"
            referencedColumns: ["profil_id"]
          },
          {
            foreignKeyName: "personenbezogene_zugriffe_betroffener_b2b_kunde_id_fkey"
            columns: ["betroffener_b2b_kunde_id"]
            isOneToOne: false
            referencedRelation: "b2b_kunden"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personenbezogene_zugriffe_betroffener_pfluecker_id_fkey"
            columns: ["betroffener_pfluecker_id"]
            isOneToOne: false
            referencedRelation: "pfluecker"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personenbezogene_zugriffe_betroffener_profil_id_fkey"
            columns: ["betroffener_profil_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personenbezogene_zugriffe_betroffener_profil_id_fkey"
            columns: ["betroffener_profil_id"]
            isOneToOne: false
            referencedRelation: "schulungsteilnahmen_status"
            referencedColumns: ["profil_id"]
          },
          {
            foreignKeyName: "personenbezogene_zugriffe_zweck_id_fkey"
            columns: ["zweck_id"]
            isOneToOne: false
            referencedRelation: "verarbeitungszwecke"
            referencedColumns: ["id"]
          },
        ]
      }
      pflanzenschutz_behandlungen: {
        Row: {
          aufwandmenge: number | null
          aufwandmenge_einheit:
            | Database["public"]["Enums"]["aufwandmenge_einheit"]
            | null
          behandelt_am: string
          created_at: string
          dokument_id: string | null
          durchgefuehrt_von_profil_id: string | null
          freigabe_am: string | null
          freigegeben: boolean
          id: string
          psm_mittel_id: string
          reihenblock_id: string
          wartezeit_tage: number
        }
        Insert: {
          aufwandmenge?: number | null
          aufwandmenge_einheit?:
            | Database["public"]["Enums"]["aufwandmenge_einheit"]
            | null
          behandelt_am: string
          created_at?: string
          dokument_id?: string | null
          durchgefuehrt_von_profil_id?: string | null
          freigabe_am?: string | null
          freigegeben?: boolean
          id?: string
          psm_mittel_id: string
          reihenblock_id: string
          wartezeit_tage: number
        }
        Update: {
          aufwandmenge?: number | null
          aufwandmenge_einheit?:
            | Database["public"]["Enums"]["aufwandmenge_einheit"]
            | null
          behandelt_am?: string
          created_at?: string
          dokument_id?: string | null
          durchgefuehrt_von_profil_id?: string | null
          freigabe_am?: string | null
          freigegeben?: boolean
          id?: string
          psm_mittel_id?: string
          reihenblock_id?: string
          wartezeit_tage?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_behandlung_dokument"
            columns: ["dokument_id"]
            isOneToOne: false
            referencedRelation: "dokumente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pflanzenschutz_behandlungen_durchgefuehrt_von_profil_id_fkey"
            columns: ["durchgefuehrt_von_profil_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pflanzenschutz_behandlungen_durchgefuehrt_von_profil_id_fkey"
            columns: ["durchgefuehrt_von_profil_id"]
            isOneToOne: false
            referencedRelation: "schulungsteilnahmen_status"
            referencedColumns: ["profil_id"]
          },
          {
            foreignKeyName: "pflanzenschutz_behandlungen_psm_mittel_id_fkey"
            columns: ["psm_mittel_id"]
            isOneToOne: false
            referencedRelation: "psm_mittel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pflanzenschutz_behandlungen_reihenblock_id_fkey"
            columns: ["reihenblock_id"]
            isOneToOne: false
            referencedRelation: "reihenbloecke"
            referencedColumns: ["id"]
          },
        ]
      }
      pflueckaufgaben: {
        Row: {
          arbeitsbeginn_geraet_zeitpunkt: string | null
          arbeitsbeginn_server_eingang: string | null
          ausschuss_kg: number
          brigade_id: string | null
          charge_id: string | null
          code: string
          created_at: string
          faelligkeit: string | null
          id: string
          ist_menge_kg: number
          pfluecker_anzahl: number
          qualitaetsfaktor: number | null
          reihenblock_id: string
          sorte_id: string | null
          status: Database["public"]["Enums"]["pflueckaufgabe_status"]
          steigen_zaehler: number
          updated_at: string
          zielmenge_kg: number
        }
        Insert: {
          arbeitsbeginn_geraet_zeitpunkt?: string | null
          arbeitsbeginn_server_eingang?: string | null
          ausschuss_kg?: number
          brigade_id?: string | null
          charge_id?: string | null
          code: string
          created_at?: string
          faelligkeit?: string | null
          id?: string
          ist_menge_kg?: number
          pfluecker_anzahl?: number
          qualitaetsfaktor?: number | null
          reihenblock_id: string
          sorte_id?: string | null
          status?: Database["public"]["Enums"]["pflueckaufgabe_status"]
          steigen_zaehler?: number
          updated_at?: string
          zielmenge_kg?: number
        }
        Update: {
          arbeitsbeginn_geraet_zeitpunkt?: string | null
          arbeitsbeginn_server_eingang?: string | null
          ausschuss_kg?: number
          brigade_id?: string | null
          charge_id?: string | null
          code?: string
          created_at?: string
          faelligkeit?: string | null
          id?: string
          ist_menge_kg?: number
          pfluecker_anzahl?: number
          qualitaetsfaktor?: number | null
          reihenblock_id?: string
          sorte_id?: string | null
          status?: Database["public"]["Enums"]["pflueckaufgabe_status"]
          steigen_zaehler?: number
          updated_at?: string
          zielmenge_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "pflueckaufgaben_brigade_id_fkey"
            columns: ["brigade_id"]
            isOneToOne: false
            referencedRelation: "brigade_einsatzplan"
            referencedColumns: ["brigade_id"]
          },
          {
            foreignKeyName: "pflueckaufgaben_brigade_id_fkey"
            columns: ["brigade_id"]
            isOneToOne: false
            referencedRelation: "brigaden"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pflueckaufgaben_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "chargen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pflueckaufgaben_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "deckungsbeitrag_je_charge"
            referencedColumns: ["charge_id"]
          },
          {
            foreignKeyName: "pflueckaufgaben_reihenblock_id_fkey"
            columns: ["reihenblock_id"]
            isOneToOne: false
            referencedRelation: "reihenbloecke"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pflueckaufgaben_sorte_id_fkey"
            columns: ["sorte_id"]
            isOneToOne: false
            referencedRelation: "sorten"
            referencedColumns: ["id"]
          },
        ]
      }
      pfluecker: {
        Row: {
          ausweis: string
          brigade_id: string | null
          created_at: string
          esutd: Database["public"]["Enums"]["esutd_status"]
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          ausweis: string
          brigade_id?: string | null
          created_at?: string
          esutd?: Database["public"]["Enums"]["esutd_status"]
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          ausweis?: string
          brigade_id?: string | null
          created_at?: string
          esutd?: Database["public"]["Enums"]["esutd_status"]
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pfluecker_brigade_id_fkey"
            columns: ["brigade_id"]
            isOneToOne: false
            referencedRelation: "brigade_einsatzplan"
            referencedColumns: ["brigade_id"]
          },
          {
            foreignKeyName: "pfluecker_brigade_id_fkey"
            columns: ["brigade_id"]
            isOneToOne: false
            referencedRelation: "brigaden"
            referencedColumns: ["id"]
          },
        ]
      }
      plantagen: {
        Row: {
          betrieb_id: string
          created_at: string
          id: string
          nachbarbetrieb_id: string | null
          name: string
          ort: string | null
          typ: Database["public"]["Enums"]["plantage_typ"]
          updated_at: string
        }
        Insert: {
          betrieb_id: string
          created_at?: string
          id?: string
          nachbarbetrieb_id?: string | null
          name: string
          ort?: string | null
          typ?: Database["public"]["Enums"]["plantage_typ"]
          updated_at?: string
        }
        Update: {
          betrieb_id?: string
          created_at?: string
          id?: string
          nachbarbetrieb_id?: string | null
          name?: string
          ort?: string | null
          typ?: Database["public"]["Enums"]["plantage_typ"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plantagen_betrieb_id_fkey"
            columns: ["betrieb_id"]
            isOneToOne: false
            referencedRelation: "betriebe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plantagen_nachbarbetrieb_id_fkey"
            columns: ["nachbarbetrieb_id"]
            isOneToOne: false
            referencedRelation: "nachbarbetriebe"
            referencedColumns: ["id"]
          },
        ]
      }
      preislisten: {
        Row: {
          aktiv: boolean
          created_at: string
          gueltig_ab: string
          gueltig_bis: string | null
          id: string
          kundengruppe: Database["public"]["Enums"]["kundengruppe"] | null
          name: string
        }
        Insert: {
          aktiv?: boolean
          created_at?: string
          gueltig_ab?: string
          gueltig_bis?: string | null
          id?: string
          kundengruppe?: Database["public"]["Enums"]["kundengruppe"] | null
          name: string
        }
        Update: {
          aktiv?: boolean
          created_at?: string
          gueltig_ab?: string
          gueltig_bis?: string | null
          id?: string
          kundengruppe?: Database["public"]["Enums"]["kundengruppe"] | null
          name?: string
        }
        Relationships: []
      }
      preislisten_positionen: {
        Row: {
          created_at: string
          id: string
          min_menge_kg: number
          preis_tenge_kg: number
          preisliste_id: string
          sorte_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          min_menge_kg?: number
          preis_tenge_kg: number
          preisliste_id: string
          sorte_id: string
        }
        Update: {
          created_at?: string
          id?: string
          min_menge_kg?: number
          preis_tenge_kg?: number
          preisliste_id?: string
          sorte_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "preislisten_positionen_preisliste_id_fkey"
            columns: ["preisliste_id"]
            isOneToOne: false
            referencedRelation: "preislisten"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "preislisten_positionen_sorte_id_fkey"
            columns: ["sorte_id"]
            isOneToOne: false
            referencedRelation: "sorten"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          auth_user_id: string | null
          b2b_kunde_id: string | null
          brigade_id: string | null
          created_at: string
          darf_kontrollieren: boolean
          email: string | null
          full_name: string
          id: string
          pfluecker_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          b2b_kunde_id?: string | null
          brigade_id?: string | null
          created_at?: string
          darf_kontrollieren?: boolean
          email?: string | null
          full_name: string
          id?: string
          pfluecker_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          b2b_kunde_id?: string | null
          brigade_id?: string | null
          created_at?: string
          darf_kontrollieren?: boolean
          email?: string | null
          full_name?: string
          id?: string
          pfluecker_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_profiles_brigade"
            columns: ["brigade_id"]
            isOneToOne: false
            referencedRelation: "brigade_einsatzplan"
            referencedColumns: ["brigade_id"]
          },
          {
            foreignKeyName: "fk_profiles_brigade"
            columns: ["brigade_id"]
            isOneToOne: false
            referencedRelation: "brigaden"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_b2b_kunde_id_fkey"
            columns: ["b2b_kunde_id"]
            isOneToOne: false
            referencedRelation: "b2b_kunden"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_pfluecker_id_fkey"
            columns: ["pfluecker_id"]
            isOneToOne: false
            referencedRelation: "pfluecker"
            referencedColumns: ["id"]
          },
        ]
      }
      psm_mittel: {
        Row: {
          created_at: string
          id: string
          name: string
          wartezeit_tage: number
          wirkstoff: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          wartezeit_tage?: number
          wirkstoff?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          wartezeit_tage?: number
          wirkstoff?: string | null
        }
        Relationships: []
      }
      reihenbloecke: {
        Row: {
          code: string
          created_at: string
          id: string
          laenge_m: number | null
          letzte_ernte: string | null
          reihengruppe_id: string
          sorte_id: string | null
          status: Database["public"]["Enums"]["reihenblock_status"]
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          laenge_m?: number | null
          letzte_ernte?: string | null
          reihengruppe_id: string
          sorte_id?: string | null
          status?: Database["public"]["Enums"]["reihenblock_status"]
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          laenge_m?: number | null
          letzte_ernte?: string | null
          reihengruppe_id?: string
          sorte_id?: string | null
          status?: Database["public"]["Enums"]["reihenblock_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reihenbloecke_reihengruppe_id_fkey"
            columns: ["reihengruppe_id"]
            isOneToOne: false
            referencedRelation: "reihengruppen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reihenbloecke_sorte_id_fkey"
            columns: ["sorte_id"]
            isOneToOne: false
            referencedRelation: "sorten"
            referencedColumns: ["id"]
          },
        ]
      }
      reihengruppen: {
        Row: {
          anzahl_reihenbloecke: number
          created_at: string
          feldparzelle_id: string
          id: string
          name: string
          spalierrichtung: Database["public"]["Enums"]["spalierrichtung"]
          updated_at: string
        }
        Insert: {
          anzahl_reihenbloecke?: number
          created_at?: string
          feldparzelle_id: string
          id?: string
          name: string
          spalierrichtung?: Database["public"]["Enums"]["spalierrichtung"]
          updated_at?: string
        }
        Update: {
          anzahl_reihenbloecke?: number
          created_at?: string
          feldparzelle_id?: string
          id?: string
          name?: string
          spalierrichtung?: Database["public"]["Enums"]["spalierrichtung"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reihengruppen_feldparzelle_id_fkey"
            columns: ["feldparzelle_id"]
            isOneToOne: false
            referencedRelation: "feldparzellen"
            referencedColumns: ["id"]
          },
        ]
      }
      reklamation_ereignisse: {
        Row: {
          autor_id: string | null
          created_at: string
          id: string
          neuer_status: Database["public"]["Enums"]["reklamation_status"] | null
          reklamation_id: string
          sichtbar_fuer_kunde: boolean
          text: string
        }
        Insert: {
          autor_id?: string | null
          created_at?: string
          id?: string
          neuer_status?:
            | Database["public"]["Enums"]["reklamation_status"]
            | null
          reklamation_id: string
          sichtbar_fuer_kunde?: boolean
          text: string
        }
        Update: {
          autor_id?: string | null
          created_at?: string
          id?: string
          neuer_status?:
            | Database["public"]["Enums"]["reklamation_status"]
            | null
          reklamation_id?: string
          sichtbar_fuer_kunde?: boolean
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "reklamation_ereignisse_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reklamation_ereignisse_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "schulungsteilnahmen_status"
            referencedColumns: ["profil_id"]
          },
          {
            foreignKeyName: "reklamation_ereignisse_reklamation_id_fkey"
            columns: ["reklamation_id"]
            isOneToOne: false
            referencedRelation: "reklamationen"
            referencedColumns: ["id"]
          },
        ]
      }
      reklamationen: {
        Row: {
          b2b_kunde_id: string
          beschreibung: string | null
          betreff: string
          betroffene_menge_kg: number | null
          charge_id: string | null
          code: string
          created_at: string
          erledigt_am: string | null
          frist_am: string | null
          gemeldet_am: string
          gemeldet_von: string | null
          grund: Database["public"]["Enums"]["reklamation_grund"]
          gutschrift_tenge: number | null
          id: string
          loesung: string | null
          status: Database["public"]["Enums"]["reklamation_status"]
          updated_at: string
        }
        Insert: {
          b2b_kunde_id: string
          beschreibung?: string | null
          betreff: string
          betroffene_menge_kg?: number | null
          charge_id?: string | null
          code: string
          created_at?: string
          erledigt_am?: string | null
          frist_am?: string | null
          gemeldet_am?: string
          gemeldet_von?: string | null
          grund: Database["public"]["Enums"]["reklamation_grund"]
          gutschrift_tenge?: number | null
          id?: string
          loesung?: string | null
          status?: Database["public"]["Enums"]["reklamation_status"]
          updated_at?: string
        }
        Update: {
          b2b_kunde_id?: string
          beschreibung?: string | null
          betreff?: string
          betroffene_menge_kg?: number | null
          charge_id?: string | null
          code?: string
          created_at?: string
          erledigt_am?: string | null
          frist_am?: string | null
          gemeldet_am?: string
          gemeldet_von?: string | null
          grund?: Database["public"]["Enums"]["reklamation_grund"]
          gutschrift_tenge?: number | null
          id?: string
          loesung?: string | null
          status?: Database["public"]["Enums"]["reklamation_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reklamationen_b2b_kunde_id_fkey"
            columns: ["b2b_kunde_id"]
            isOneToOne: false
            referencedRelation: "b2b_kunden"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reklamationen_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "chargen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reklamationen_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "deckungsbeitrag_je_charge"
            referencedColumns: ["charge_id"]
          },
          {
            foreignKeyName: "reklamationen_gemeldet_von_fkey"
            columns: ["gemeldet_von"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reklamationen_gemeldet_von_fkey"
            columns: ["gemeldet_von"]
            isOneToOne: false
            referencedRelation: "schulungsteilnahmen_status"
            referencedColumns: ["profil_id"]
          },
        ]
      }
      rotationsplan_eintraege: {
        Row: {
          brigade_id: string | null
          created_at: string
          geplant_fuer: string
          id: string
          intervall_tage: number
          pflueckaufgabe_id: string | null
          reihenblock_id: string
          status: Database["public"]["Enums"]["rotationsplan_status"]
          updated_at: string
        }
        Insert: {
          brigade_id?: string | null
          created_at?: string
          geplant_fuer: string
          id?: string
          intervall_tage?: number
          pflueckaufgabe_id?: string | null
          reihenblock_id: string
          status?: Database["public"]["Enums"]["rotationsplan_status"]
          updated_at?: string
        }
        Update: {
          brigade_id?: string | null
          created_at?: string
          geplant_fuer?: string
          id?: string
          intervall_tage?: number
          pflueckaufgabe_id?: string | null
          reihenblock_id?: string
          status?: Database["public"]["Enums"]["rotationsplan_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rotationsplan_eintraege_brigade_id_fkey"
            columns: ["brigade_id"]
            isOneToOne: false
            referencedRelation: "brigade_einsatzplan"
            referencedColumns: ["brigade_id"]
          },
          {
            foreignKeyName: "rotationsplan_eintraege_brigade_id_fkey"
            columns: ["brigade_id"]
            isOneToOne: false
            referencedRelation: "brigaden"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rotationsplan_eintraege_pflueckaufgabe_id_fkey"
            columns: ["pflueckaufgabe_id"]
            isOneToOne: false
            referencedRelation: "pflueckaufgaben"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rotationsplan_eintraege_reihenblock_id_fkey"
            columns: ["reihenblock_id"]
            isOneToOne: false
            referencedRelation: "reihenbloecke"
            referencedColumns: ["id"]
          },
        ]
      }
      schulungsteilnahmen: {
        Row: {
          abgeschlossen_am: string
          created_at: string
          erfasst_von_profil_id: string | null
          id: string
          profil_id: string
          schulungsvideo_id: string
        }
        Insert: {
          abgeschlossen_am?: string
          created_at?: string
          erfasst_von_profil_id?: string | null
          id?: string
          profil_id: string
          schulungsvideo_id: string
        }
        Update: {
          abgeschlossen_am?: string
          created_at?: string
          erfasst_von_profil_id?: string | null
          id?: string
          profil_id?: string
          schulungsvideo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schulungsteilnahmen_erfasst_von_profil_id_fkey"
            columns: ["erfasst_von_profil_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schulungsteilnahmen_erfasst_von_profil_id_fkey"
            columns: ["erfasst_von_profil_id"]
            isOneToOne: false
            referencedRelation: "schulungsteilnahmen_status"
            referencedColumns: ["profil_id"]
          },
          {
            foreignKeyName: "schulungsteilnahmen_profil_id_fkey"
            columns: ["profil_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schulungsteilnahmen_profil_id_fkey"
            columns: ["profil_id"]
            isOneToOne: false
            referencedRelation: "schulungsteilnahmen_status"
            referencedColumns: ["profil_id"]
          },
          {
            foreignKeyName: "schulungsteilnahmen_schulungsvideo_id_fkey"
            columns: ["schulungsvideo_id"]
            isOneToOne: false
            referencedRelation: "schulungsteilnahmen_status"
            referencedColumns: ["schulungsvideo_id"]
          },
          {
            foreignKeyName: "schulungsteilnahmen_schulungsvideo_id_fkey"
            columns: ["schulungsvideo_id"]
            isOneToOne: false
            referencedRelation: "schulungsvideos"
            referencedColumns: ["id"]
          },
        ]
      }
      schulungsvideos: {
        Row: {
          created_at: string
          dauer_sekunden: number | null
          frist_monate: number
          id: string
          pflicht: boolean
          sprachen: string[]
          storage_path: string | null
          thema: string | null
          titel: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dauer_sekunden?: number | null
          frist_monate?: number
          id?: string
          pflicht?: boolean
          sprachen?: string[]
          storage_path?: string | null
          thema?: string | null
          titel: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dauer_sekunden?: number | null
          frist_monate?: number
          id?: string
          pflicht?: boolean
          sprachen?: string[]
          storage_path?: string | null
          thema?: string | null
          titel?: string
          updated_at?: string
        }
        Relationships: []
      }
      sorten: {
        Row: {
          created_at: string
          erntefenster: string | null
          id: string
          name: string
          schale_g: number | null
          typ: Database["public"]["Enums"]["sorte_typ"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          erntefenster?: string | null
          id?: string
          name: string
          schale_g?: number | null
          typ: Database["public"]["Enums"]["sorte_typ"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          erntefenster?: string | null
          id?: string
          name?: string
          schale_g?: number | null
          typ?: Database["public"]["Enums"]["sorte_typ"]
          updated_at?: string
        }
        Relationships: []
      }
      steigen: {
        Row: {
          charge_id: string | null
          code: string
          created_at: string
          erfasst_von_profil_id: string | null
          geraet_zeitpunkt: string | null
          gewicht_kg: number | null
          id: string
          kontroll_befund: Database["public"]["Enums"]["kontroll_befund"] | null
          kontroll_begruendung: string | null
          kontrolliert_am: string | null
          kontrolliert_von_profil_id: string | null
          pflueckaufgabe_id: string | null
          pfluecker_id: string | null
          qr_token: string
          scan_zeitpunkt: string | null
          server_eingang_zeitpunkt: string | null
        }
        Insert: {
          charge_id?: string | null
          code: string
          created_at?: string
          erfasst_von_profil_id?: string | null
          geraet_zeitpunkt?: string | null
          gewicht_kg?: number | null
          id?: string
          kontroll_befund?:
            | Database["public"]["Enums"]["kontroll_befund"]
            | null
          kontroll_begruendung?: string | null
          kontrolliert_am?: string | null
          kontrolliert_von_profil_id?: string | null
          pflueckaufgabe_id?: string | null
          pfluecker_id?: string | null
          qr_token: string
          scan_zeitpunkt?: string | null
          server_eingang_zeitpunkt?: string | null
        }
        Update: {
          charge_id?: string | null
          code?: string
          created_at?: string
          erfasst_von_profil_id?: string | null
          geraet_zeitpunkt?: string | null
          gewicht_kg?: number | null
          id?: string
          kontroll_befund?:
            | Database["public"]["Enums"]["kontroll_befund"]
            | null
          kontroll_begruendung?: string | null
          kontrolliert_am?: string | null
          kontrolliert_von_profil_id?: string | null
          pflueckaufgabe_id?: string | null
          pfluecker_id?: string | null
          qr_token?: string
          scan_zeitpunkt?: string | null
          server_eingang_zeitpunkt?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "steigen_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "chargen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "steigen_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "deckungsbeitrag_je_charge"
            referencedColumns: ["charge_id"]
          },
          {
            foreignKeyName: "steigen_erfasst_von_profil_id_fkey"
            columns: ["erfasst_von_profil_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "steigen_erfasst_von_profil_id_fkey"
            columns: ["erfasst_von_profil_id"]
            isOneToOne: false
            referencedRelation: "schulungsteilnahmen_status"
            referencedColumns: ["profil_id"]
          },
          {
            foreignKeyName: "steigen_kontrolliert_von_profil_id_fkey"
            columns: ["kontrolliert_von_profil_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "steigen_kontrolliert_von_profil_id_fkey"
            columns: ["kontrolliert_von_profil_id"]
            isOneToOne: false
            referencedRelation: "schulungsteilnahmen_status"
            referencedColumns: ["profil_id"]
          },
          {
            foreignKeyName: "steigen_pflueckaufgabe_id_fkey"
            columns: ["pflueckaufgabe_id"]
            isOneToOne: false
            referencedRelation: "pflueckaufgaben"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "steigen_pfluecker_id_fkey"
            columns: ["pfluecker_id"]
            isOneToOne: false
            referencedRelation: "pfluecker"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_protokoll: {
        Row: {
          aktion_id: string
          aktion_typ: string
          ergebnis: string
          erstellt_am: string
          ressource_id: string
        }
        Insert: {
          aktion_id: string
          aktion_typ: string
          ergebnis: string
          erstellt_am?: string
          ressource_id: string
        }
        Update: {
          aktion_id?: string
          aktion_typ?: string
          ergebnis?: string
          erstellt_am?: string
          ressource_id?: string
        }
        Relationships: []
      }
      touren: {
        Row: {
          created_at: string
          datum: string
          dauer_minuten: number | null
          distanz_km: number | null
          erstellt_von_profil_id: string | null
          id: string
          routen_geometrie: Json | null
          status: Database["public"]["Enums"]["tour_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          datum: string
          dauer_minuten?: number | null
          distanz_km?: number | null
          erstellt_von_profil_id?: string | null
          id?: string
          routen_geometrie?: Json | null
          status?: Database["public"]["Enums"]["tour_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          datum?: string
          dauer_minuten?: number | null
          distanz_km?: number | null
          erstellt_von_profil_id?: string | null
          id?: string
          routen_geometrie?: Json | null
          status?: Database["public"]["Enums"]["tour_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "touren_erstellt_von_profil_id_fkey"
            columns: ["erstellt_von_profil_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "touren_erstellt_von_profil_id_fkey"
            columns: ["erstellt_von_profil_id"]
            isOneToOne: false
            referencedRelation: "schulungsteilnahmen_status"
            referencedColumns: ["profil_id"]
          },
        ]
      }
      transport_temperatur_messungen: {
        Row: {
          created_at: string
          ergebnis: Database["public"]["Enums"]["kuehlkette_ergebnis"]
          gemessen_am: string
          geraet_zeitpunkt: string | null
          id: string
          lieferung_id: string
          server_eingang_zeitpunkt: string | null
          temperatur_c: number
        }
        Insert: {
          created_at?: string
          ergebnis?: Database["public"]["Enums"]["kuehlkette_ergebnis"]
          gemessen_am: string
          geraet_zeitpunkt?: string | null
          id?: string
          lieferung_id: string
          server_eingang_zeitpunkt?: string | null
          temperatur_c: number
        }
        Update: {
          created_at?: string
          ergebnis?: Database["public"]["Enums"]["kuehlkette_ergebnis"]
          gemessen_am?: string
          geraet_zeitpunkt?: string | null
          id?: string
          lieferung_id?: string
          server_eingang_zeitpunkt?: string | null
          temperatur_c?: number
        }
        Relationships: [
          {
            foreignKeyName: "transport_temperatur_messungen_lieferung_id_fkey"
            columns: ["lieferung_id"]
            isOneToOne: false
            referencedRelation: "lieferungen"
            referencedColumns: ["id"]
          },
        ]
      }
      verarbeitungszwecke: {
        Row: {
          aufbewahrung_monate: number
          automatisierte_entscheidung: boolean
          beschreibung: string | null
          bezeichnung: string
          code: string
          created_at: string
          id: string
          rechtsgrundlage: Database["public"]["Enums"]["rechtsgrundlage_typ"]
          updated_at: string
          verantwortlich_profil_id: string | null
        }
        Insert: {
          aufbewahrung_monate: number
          automatisierte_entscheidung?: boolean
          beschreibung?: string | null
          bezeichnung: string
          code: string
          created_at?: string
          id?: string
          rechtsgrundlage: Database["public"]["Enums"]["rechtsgrundlage_typ"]
          updated_at?: string
          verantwortlich_profil_id?: string | null
        }
        Update: {
          aufbewahrung_monate?: number
          automatisierte_entscheidung?: boolean
          beschreibung?: string | null
          bezeichnung?: string
          code?: string
          created_at?: string
          id?: string
          rechtsgrundlage?: Database["public"]["Enums"]["rechtsgrundlage_typ"]
          updated_at?: string
          verantwortlich_profil_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "verarbeitungszwecke_verantwortlich_profil_id_fkey"
            columns: ["verantwortlich_profil_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verarbeitungszwecke_verantwortlich_profil_id_fkey"
            columns: ["verantwortlich_profil_id"]
            isOneToOne: false
            referencedRelation: "schulungsteilnahmen_status"
            referencedColumns: ["profil_id"]
          },
        ]
      }
      vorbestellungen: {
        Row: {
          b2b_kunde_id: string
          created_at: string
          id: string
          liefertermin: string | null
          menge_kg: number
          sorte_id: string
          status: Database["public"]["Enums"]["vorbestellung_status"]
          updated_at: string
        }
        Insert: {
          b2b_kunde_id: string
          created_at?: string
          id?: string
          liefertermin?: string | null
          menge_kg: number
          sorte_id: string
          status?: Database["public"]["Enums"]["vorbestellung_status"]
          updated_at?: string
        }
        Update: {
          b2b_kunde_id?: string
          created_at?: string
          id?: string
          liefertermin?: string | null
          menge_kg?: number
          sorte_id?: string
          status?: Database["public"]["Enums"]["vorbestellung_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vorbestellungen_b2b_kunde_id_fkey"
            columns: ["b2b_kunde_id"]
            isOneToOne: false
            referencedRelation: "b2b_kunden"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vorbestellungen_sorte_id_fkey"
            columns: ["sorte_id"]
            isOneToOne: false
            referencedRelation: "sorten"
            referencedColumns: ["id"]
          },
        ]
      }
      wetter_messungen: {
        Row: {
          created_at: string
          feldparzelle_id: string | null
          gemessen_am: string
          id: string
          niederschlag_mm: number | null
          temp_max_c: number | null
          temp_min_c: number | null
          temperatursumme: number | null
        }
        Insert: {
          created_at?: string
          feldparzelle_id?: string | null
          gemessen_am: string
          id?: string
          niederschlag_mm?: number | null
          temp_max_c?: number | null
          temp_min_c?: number | null
          temperatursumme?: number | null
        }
        Update: {
          created_at?: string
          feldparzelle_id?: string | null
          gemessen_am?: string
          id?: string
          niederschlag_mm?: number | null
          temp_max_c?: number | null
          temp_min_c?: number | null
          temperatursumme?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "wetter_messungen_feldparzelle_id_fkey"
            columns: ["feldparzelle_id"]
            isOneToOne: false
            referencedRelation: "feldparzellen"
            referencedColumns: ["id"]
          },
        ]
      }
      zukauf_positionen: {
        Row: {
          charge_id: string | null
          created_at: string
          id: string
          menge_kg: number
          nachbarbetrieb_id: string
          preis_tenge_kg: number | null
          rechnungsdatum: string | null
          sorte_id: string | null
        }
        Insert: {
          charge_id?: string | null
          created_at?: string
          id?: string
          menge_kg: number
          nachbarbetrieb_id: string
          preis_tenge_kg?: number | null
          rechnungsdatum?: string | null
          sorte_id?: string | null
        }
        Update: {
          charge_id?: string | null
          created_at?: string
          id?: string
          menge_kg?: number
          nachbarbetrieb_id?: string
          preis_tenge_kg?: number | null
          rechnungsdatum?: string | null
          sorte_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "zukauf_positionen_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "chargen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zukauf_positionen_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "deckungsbeitrag_je_charge"
            referencedColumns: ["charge_id"]
          },
          {
            foreignKeyName: "zukauf_positionen_nachbarbetrieb_id_fkey"
            columns: ["nachbarbetrieb_id"]
            isOneToOne: false
            referencedRelation: "nachbarbetriebe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zukauf_positionen_sorte_id_fkey"
            columns: ["sorte_id"]
            isOneToOne: false
            referencedRelation: "sorten"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      brigade_einsatzplan: {
        Row: {
          bloecke_zugewiesen: number | null
          brigade_id: string | null
          brigade_name: string | null
          geplant_fuer: string | null
          staerke: number | null
        }
        Relationships: []
      }
      brigadenplanung_bedarf: {
        Row: {
          bloecke_gesamt: number | null
          bloecke_offen: number | null
          bloecke_zugewiesen: number | null
          geplant_fuer: string | null
        }
        Relationships: []
      }
      deckungsbeitrag_je_charge: {
        Row: {
          buchungen: number | null
          charge_code: string | null
          charge_id: string | null
          deckungsbeitrag_je_kg_tenge: number | null
          deckungsbeitrag_tenge: number | null
          erloes_tenge: number | null
          ernte_datum: string | null
          kosten_tenge: number | null
          menge_kg: number | null
          reihenblock_code: string | null
          sorte_name: string | null
        }
        Relationships: []
      }
      deckungsbeitrag_je_kostentraeger: {
        Row: {
          b2b_kunde_name: string | null
          bezeichnung: string | null
          buchungen: number | null
          deckungsbeitrag_je_kg_tenge: number | null
          deckungsbeitrag_tenge: number | null
          erloes_tenge: number | null
          erntetag: string | null
          kosten_tenge: number | null
          kostentraeger_id: string | null
          menge_kg: number | null
          reihenblock_code: string | null
          sorte_name: string | null
        }
        Relationships: []
      }
      schulungsteilnahmen_status: {
        Row: {
          faellig_am: string | null
          frist_monate: number | null
          full_name: string | null
          letzte_teilnahme_am: string | null
          profil_id: string | null
          role: Database["public"]["Enums"]["app_role"] | null
          schulungsvideo_id: string | null
          status: string | null
          titel: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      abrechnung_je_nachbarbetrieb: {
        Args: never
        Returns: {
          auszahlung_tenge: number
          einkaufswert_tenge: number
          menge_kg_gesamt: number
          nachbarbetrieb_id: string
          nachbarbetrieb_name: string
          spanne_prozent: number
        }[]
      }
      audit_bereich_fuer: {
        Args: { p_tabelle: string }
        Returns: Database["public"]["Enums"]["audit_bereich"]
      }
      current_app_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      current_b2b_kunde_id: { Args: never; Returns: string }
      einladung_abschliessen: {
        Args: { p_auth_user_id: string; p_code_digest: string; p_email: string }
        Returns: string
      }
      einwilligung_widerrufen: {
        Args: { p_grund: string; p_id: string }
        Returns: undefined
      }
      geraet_zeitpunkt_pruefen: {
        Args: { p_geraet: string; p_server?: string }
        Returns: string
      }
      has_office_access: { Args: never; Returns: boolean }
      has_role: {
        Args: { erlaubt: Database["public"]["Enums"]["app_role"][] }
        Returns: boolean
      }
      herkunftsauskunft: {
        Args: { p_code: string }
        Returns: {
          ernte_datum: string
          herkunft_typ: string
          kuehlkette_eingehalten: boolean
          minuten_bis_vorkuehlung: number
          nachbarbetrieb_name: string
          pflueck_zeitpunkt: string
          reihenblock_code: string
          sorte_name: string
          vorkuehlung_zeitpunkt: string
          wartezeit_eingehalten: boolean
        }[]
      }
      ki_anbieter_standard_setzen: {
        Args: { p_id: string }
        Returns: undefined
      }
      ki_chat_antwort_schreiben: {
        Args: { p_anbieter_name: string; p_fallback: boolean; p_inhalt: string }
        Returns: string
      }
      ki_chat_eskalation_schreiben: {
        Args: { p_inhalt: string }
        Returns: string
      }
      kontingent_verfuegbarkeit_je_sorte: {
        Args: never
        Returns: {
          menge_kg_gesamt: number
          reserviert_kg_gesamt: number
          saison: string
          sorte_id: string
          sorte_name: string
        }[]
      }
      kpi_aktuell: {
        Args: never
        Returns: {
          basis: string
          datensaetze: number
          einheit: string
          schluessel: string
          wert: number
        }[]
      }
      lohn_periode_berechnen: {
        Args: { p_periode_ende: string; p_periode_start: string }
        Returns: {
          uebersprungen: number
          verarbeitet: number
        }[]
      }
      lohn_qualitaetsfaktor: {
        Args: {
          p_ausschussquote: number
          p_max: number
          p_min: number
          p_ziel: number
        }
        Returns: number
      }
      nummernart_fuer_rechtsform: {
        Args: { p_rechtsform: Database["public"]["Enums"]["rechtsform"] }
        Returns: string
      }
      pruefziffer_stimmt: { Args: { p_nummer: string }; Returns: boolean }
      reihenblock_freigeben: {
        Args: {
          p_block: string
          p_status?: Database["public"]["Enums"]["reihenblock_status"]
        }
        Returns: {
          code: string
          created_at: string
          id: string
          laenge_m: number | null
          letzte_ernte: string | null
          reihengruppe_id: string
          sorte_id: string | null
          status: Database["public"]["Enums"]["reihenblock_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "reihenbloecke"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rotationsplan_generieren: {
        Args: { p_ab?: string; p_wochen?: number }
        Returns: {
          betroffener_block_id: string
          neue_termine: number
        }[]
      }
      rueckstandsnachweis: {
        Args: { p_charge: string }
        Returns: {
          behandelt_am: string
          eingehalten: boolean
          freigabe_am: string
          mittel: string
          tage_vor_ernte: number
          wartezeit_tage: number
          wirkstoff: string
        }[]
      }
      sync_aufgabe_status_setzen: {
        Args: {
          p_aktion_id: string
          p_arbeitsbeginn_geraet_zeitpunkt?: string
          p_aufgabe_id: string
          p_neuer_status: string
          p_vorzustand: string
        }
        Returns: {
          code: string
          ergebnis: string
        }[]
      }
      sync_menge_melden: {
        Args: {
          p_aktion_id: string
          p_aufgabe_id: string
          p_ausschuss_kg?: number
          p_ist_menge_kg: number
          p_pfluecker_anzahl?: number
        }
        Returns: {
          code: string
          ergebnis: string
        }[]
      }
      temperaturband_bewerten: {
        Args: { grad: number }
        Returns: Database["public"]["Enums"]["kuehlkette_ergebnis"]
      }
      zukauf_positionen_importieren: {
        Args: { p_zeilen: Json }
        Returns: number
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "betriebsleitung"
        | "buchhaltung"
        | "brigade"
        | "picker"
        | "erzeuger"
        | "kunde"
      audit_bereich:
        | "nachweiskette"
        | "geld"
        | "zugang"
        | "datenschutz"
        | "stammdaten"
      aufwandmenge_einheit: "l_ha" | "kg_ha"
      beleg_art: "schale" | "reihenblock" | "steige"
      charge_status: "offen" | "gekuehlt" | "verladen" | "ausgeliefert"
      dokument_kategorie:
        | "spritzmittelprotokoll"
        | "esutd_nachweis"
        | "liefervertrag"
        | "foerderdossier"
        | "zertifikat"
        | "sonstiges"
      dokument_status: "gueltig" | "prueflauf" | "abgelaufen"
      einladung_status: "offen" | "eingeloest" | "zurueckgezogen"
      einwilligung_kanal: "papier" | "app" | "web" | "sms"
      esutd_status: "erfasst" | "offen"
      integration_status: "verbunden" | "sandbox" | "geplant"
      ki_anbieter_typ: "openai_kompatibel" | "anthropic"
      kontaktkanal_typ:
        | "whatsapp"
        | "telegram"
        | "instagram"
        | "kaspi_qr"
        | "sonstiges"
      kontroll_befund: "in_ordnung" | "abweichung"
      kuehlkette_ergebnis: "ok" | "warnung" | "verstoss"
      kundengruppe: "handel" | "gastronomie" | "einzelhandel"
      ledger_typ: "erloes" | "kosten"
      lieferung_status: "geplant" | "zugestellt" | "storniert"
      lohn_status: "entwurf" | "freigegeben" | "ausgezahlt"
      outbox_status: "pending" | "sent" | "acked" | "failed"
      pflueckaufgabe_status:
        | "offen"
        | "angenommen"
        | "in_arbeit"
        | "beleg_pruefung"
        | "abgeschlossen"
      plantage_typ: "eigen" | "nachbarbetrieb"
      rechtsform: "kh_fh" | "ip" | "privatperson" | "too" | "ao" | "pk"
      rechtsgrundlage_typ: "einwilligung" | "vertrag" | "gesetzliche_pflicht"
      reihenblock_status:
        | "bepflanzt"
        | "erntereif"
        | "ruhend"
        | "rueckschnitt"
        | "wartezeitgesperrt"
      reklamation_grund:
        | "qualitaet"
        | "menge"
        | "verspaetung"
        | "verpackung"
        | "temperatur"
        | "sonstiges"
      reklamation_status:
        | "offen"
        | "in_pruefung"
        | "angenommen"
        | "abgelehnt"
        | "erledigt"
      rotationsplan_status:
        | "geplant"
        | "gesperrt"
        | "erledigt"
        | "uebersprungen"
      sorte_typ: "remontierend" | "sommertragend"
      spalierrichtung: "n_s" | "o_w"
      tour_status: "geplant" | "unterwegs" | "abgeschlossen"
      vorbestellung_status:
        | "angefragt"
        | "bestaetigt"
        | "geliefert"
        | "storniert"
      vorfall_art:
        | "unbefugter_zugriff"
        | "verlust"
        | "offenlegung"
        | "sonstiges"
      zugriffsaktion: "lesen" | "export" | "druck" | "uebermittlung"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: [
        "admin",
        "betriebsleitung",
        "buchhaltung",
        "brigade",
        "picker",
        "erzeuger",
        "kunde",
      ],
      audit_bereich: [
        "nachweiskette",
        "geld",
        "zugang",
        "datenschutz",
        "stammdaten",
      ],
      aufwandmenge_einheit: ["l_ha", "kg_ha"],
      beleg_art: ["schale", "reihenblock", "steige"],
      charge_status: ["offen", "gekuehlt", "verladen", "ausgeliefert"],
      dokument_kategorie: [
        "spritzmittelprotokoll",
        "esutd_nachweis",
        "liefervertrag",
        "foerderdossier",
        "zertifikat",
        "sonstiges",
      ],
      dokument_status: ["gueltig", "prueflauf", "abgelaufen"],
      einladung_status: ["offen", "eingeloest", "zurueckgezogen"],
      einwilligung_kanal: ["papier", "app", "web", "sms"],
      esutd_status: ["erfasst", "offen"],
      integration_status: ["verbunden", "sandbox", "geplant"],
      ki_anbieter_typ: ["openai_kompatibel", "anthropic"],
      kontaktkanal_typ: [
        "whatsapp",
        "telegram",
        "instagram",
        "kaspi_qr",
        "sonstiges",
      ],
      kontroll_befund: ["in_ordnung", "abweichung"],
      kuehlkette_ergebnis: ["ok", "warnung", "verstoss"],
      kundengruppe: ["handel", "gastronomie", "einzelhandel"],
      ledger_typ: ["erloes", "kosten"],
      lieferung_status: ["geplant", "zugestellt", "storniert"],
      lohn_status: ["entwurf", "freigegeben", "ausgezahlt"],
      outbox_status: ["pending", "sent", "acked", "failed"],
      pflueckaufgabe_status: [
        "offen",
        "angenommen",
        "in_arbeit",
        "beleg_pruefung",
        "abgeschlossen",
      ],
      plantage_typ: ["eigen", "nachbarbetrieb"],
      rechtsform: ["kh_fh", "ip", "privatperson", "too", "ao", "pk"],
      rechtsgrundlage_typ: ["einwilligung", "vertrag", "gesetzliche_pflicht"],
      reihenblock_status: [
        "bepflanzt",
        "erntereif",
        "ruhend",
        "rueckschnitt",
        "wartezeitgesperrt",
      ],
      reklamation_grund: [
        "qualitaet",
        "menge",
        "verspaetung",
        "verpackung",
        "temperatur",
        "sonstiges",
      ],
      reklamation_status: [
        "offen",
        "in_pruefung",
        "angenommen",
        "abgelehnt",
        "erledigt",
      ],
      rotationsplan_status: [
        "geplant",
        "gesperrt",
        "erledigt",
        "uebersprungen",
      ],
      sorte_typ: ["remontierend", "sommertragend"],
      spalierrichtung: ["n_s", "o_w"],
      tour_status: ["geplant", "unterwegs", "abgeschlossen"],
      vorbestellung_status: [
        "angefragt",
        "bestaetigt",
        "geliefert",
        "storniert",
      ],
      vorfall_art: [
        "unbefugter_zugriff",
        "verlust",
        "offenlegung",
        "sonstiges",
      ],
      zugriffsaktion: ["lesen", "export", "druck", "uebermittlung"],
    },
  },
} as const

