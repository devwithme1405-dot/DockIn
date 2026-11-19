-- Chat documents up to 50 MB (the app gzips anything over 8 MB first).
update storage.buckets
   set file_size_limit = 52428800
 where id = 'chat-files';
