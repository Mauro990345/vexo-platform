-- Frase (editável por clínica) enviada como mensagem de texto separada
-- logo antes do vídeo de confirmação de agendamento — antes era um texto
-- fixo no código, sem como personalizar por clínica.
ALTER TABLE "Clinic" ADD COLUMN "confirmationVideoCaption" TEXT;
