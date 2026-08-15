-- Rollback: clients_caregiver_read auf alten (fehlerhaften, caregivers-Join) Stand
DROP POLICY IF EXISTS clients_caregiver_read ON public.clients;
CREATE POLICY clients_caregiver_read ON public.clients
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.caregivers c
      JOIN public.assignments a ON a.caregiver_id = c.id
      WHERE c.user_id = auth.uid()
      AND a.client_id = clients.id
      AND a.status = 'active'
    )
  );
