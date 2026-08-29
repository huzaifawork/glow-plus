-- T83 — how many clients a salon can serve at once.
--
-- Availability treated every merchant as a SINGLE resource: one appointment at
-- a time, no matter how many chairs or stylists the salon actually has. The
-- limitation was known and documented in availability.service.ts, and its
-- effect is that a four-chair salon reads as fully booked the moment ONE
-- client books — it under-reports availability, and every slot a real stylist
-- was free for simply never appeared.
--
-- DEFAULT 1 reproduces the old behaviour exactly, so every salon already in
-- the database keeps working unchanged until someone sets a real number. That
-- matters: this ships to a live platform, and a default of, say, 4 would
-- silently start accepting four concurrent bookings at one-person salons that
-- never asked for it and cannot honour them.
ALTER TABLE "Merchant" ADD COLUMN "seats" INTEGER NOT NULL DEFAULT 1;

-- A salon with zero seats can never be booked, and a negative one is
-- meaningless. The API validates this too (SEATS_MIN/SEATS_MAX in
-- common/limits.ts), but the API is not the only thing that writes here — the
-- Supabase table editor is a supported path on this project, and a number
-- typed there gets no DTO validation at all.
ALTER TABLE "Merchant" ADD CONSTRAINT "Merchant_seats_positive" CHECK ("seats" >= 1 AND "seats" <= 100);
