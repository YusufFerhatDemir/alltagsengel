-- Angel Reviews / Bewertungen
CREATE TABLE IF NOT EXISTS public.angel_reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  angel_id UUID NOT NULL REFERENCES public.angels(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  punctuality INTEGER CHECK (punctuality >= 1 AND punctuality <= 5),
  friendliness INTEGER CHECK (friendliness >= 1 AND friendliness <= 5),
  reliability INTEGER CHECK (reliability >= 1 AND reliability <= 5),
  comment TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_angel_reviews_angel_id ON public.angel_reviews(angel_id);
CREATE INDEX idx_angel_reviews_booking_id ON public.angel_reviews(booking_id);
CREATE INDEX idx_angel_reviews_customer_id ON public.angel_reviews(customer_id);
CREATE UNIQUE INDEX idx_angel_reviews_unique_booking ON public.angel_reviews(booking_id);

ALTER TABLE public.angel_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Jeder kann Bewertungen lesen" ON public.angel_reviews FOR SELECT USING (true);
CREATE POLICY "Kunde kann eigene Bewertung erstellen" ON public.angel_reviews FOR INSERT WITH CHECK (auth.uid() = customer_id);
CREATE POLICY "Kunde kann eigene Bewertung bearbeiten" ON public.angel_reviews FOR UPDATE USING (auth.uid() = customer_id);
CREATE POLICY "Admin kann alle Bewertungen verwalten" ON public.angel_reviews FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
);
