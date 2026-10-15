-- Retired-document filtering must not turn the user list into table lookups.
DROP INDEX events_activity_time;
CREATE INDEX events_activity_time
  ON events(occurred_at, visitor_hash, kind, is_personal, id, bot, duplicate_of, path)
  WHERE bot = 0 AND duplicate_of = '' AND visitor_hash != ''
    AND kind IN ('page_view', 'pdf_request', 'outbound_click');
