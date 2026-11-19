-- Client roles use Data API/RPC and do not administer tables or constraints.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
