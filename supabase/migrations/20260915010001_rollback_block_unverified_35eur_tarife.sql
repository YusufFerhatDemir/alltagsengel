-- Rollback: M-3 Tarife zurück auf unverified
-- ACHTUNG: Nur ausführen wenn bewusst unverified gewünscht

UPDATE public.billing_tariffs
SET tarif_status = 'unverified',
    updated_at = now()
WHERE preis_cent = 3500
  AND tarif_status = 'blocked';
