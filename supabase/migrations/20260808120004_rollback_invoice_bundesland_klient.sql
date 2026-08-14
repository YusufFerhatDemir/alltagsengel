-- Rollback: 20260808120002_invoice_bundesland_klient.sql
-- Entfernt die klientenbasierte Bundesland-Aufloesung aus
-- create_invoice_draft_atomic und stellt die vorherige Version
-- (20260807180000) wieder her, sofern sie noch existiert.
-- Falls nicht: Funktion einfach droppen, da sie in v4 (tariff_stammdaten_v2)
-- ohnehin neu erstellt wird.

-- Spalten von invoices entfernen (falls durch diese Migration hinzugefuegt)
ALTER TABLE public.invoices DROP COLUMN IF EXISTS bundesland_klient;
ALTER TABLE public.invoices DROP COLUMN IF EXISTS bundesland_quelle;

-- Die RPC-Funktion wird durch den naechsten Apply der
-- vorherigen Version (20260807180000) wiederhergestellt.
-- Hier nur markieren, dass ein Re-Apply noetig ist.
