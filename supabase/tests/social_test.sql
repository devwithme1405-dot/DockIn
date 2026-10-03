-- Behaviour tests for migration 0002. Run against a scratch database that has
-- the Supabase stubs plus both migrations:
--   psql -d dockin -v ON_ERROR_STOP=1 -f supabase/tests/social_test.sql
-- Any failure raises, so a clean run means every check passed.

\set ON_ERROR_STOP on
set client_min_messages = notice;

-- ---------------------------------------------------------------------------
-- Cast: three Bennett students and one outsider.
-- ---------------------------------------------------------------------------
delete from public.share_targets;
delete from public.shares;
delete from public.group_members;
delete from public.groups;
delete from public.friends;
delete from public.profiles;
delete from auth.users;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'asha@bennett.edu.in'),
  ('22222222-2222-2222-2222-222222222222', 'bibek@bennett.edu.in'),
  ('33333333-3333-3333-3333-333333333333', 'chirag@bennett.edu.in');

create or replace function pg_temp.be(who uuid) returns void language plpgsql security definer as $$
declare addr text;
begin
  select email into addr from auth.users where id = who;
  perform set_config('request.jwt.claim.sub', who::text, false);
  perform set_config('request.jwt.claims', json_build_object('email', addr)::text, false);
end $$;

create or replace function pg_temp.want(ok boolean, label text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'FAILED: %', label; end if;
  raise notice 'ok: %', label;
end $$;

-- ---------------------------------------------------------------------------
do $$
declare
  asha   uuid := '11111111-1111-1111-1111-111111111111';
  bibek  uuid := '22222222-2222-2222-2222-222222222222';
  chirag uuid := '33333333-3333-3333-3333-333333333333';
  code_a text; code_b text; code_c text;
  gid uuid; gcode text; sid uuid;
  n int;
begin
  set local role authenticated;

  -- --- profiles and codes -------------------------------------------------
  perform pg_temp.be(asha);
  code_a := (public.ensure_profile()).code;
  update public.profiles set name = 'Asha', branch = 'BTech CSE', year = 2,
    share_attendance = true, attendance_state = 'safe' where user_id = asha;
  perform pg_temp.want(code_a ~ '^[A-Z0-9]{8}$', 'code looks like a code');
  perform pg_temp.want(code_a = (public.ensure_profile()).code, 'running ensure_profile twice keeps the same code');

  perform pg_temp.be(bibek);
  code_b := (public.ensure_profile()).code;
  update public.profiles set name = 'Bibek' where user_id = bibek;
  perform pg_temp.be(chirag);
  code_c := (public.ensure_profile()).code;
  update public.profiles set name = 'Chirag' where user_id = chirag;
  perform pg_temp.want(code_a <> code_b and code_b <> code_c, 'codes are distinct');

  -- --- a stranger sees nothing --------------------------------------------
  perform pg_temp.be(chirag);
  select count(*) into n from public.profiles where user_id = asha;
  perform pg_temp.want(n = 0, 'a stranger cannot read your profile row');

  -- --- a code shows a name, a wrong code shows nothing ---------------------
  perform pg_temp.be(bibek);
  select count(*) into n from public.peek_code(code_a);
  perform pg_temp.want(n = 1, 'a real code resolves to one person');
  select count(*) into n from public.peek_code('ZZZZZZZZ');
  perform pg_temp.want(n = 0, 'a wrong code resolves to nobody');
  select count(*) into n from public.peek_code(code_b);
  perform pg_temp.want(n = 0, 'your own code does not resolve to you');
  select count(*) into n from public.peek_code(lower(code_a));
  perform pg_temp.want(n = 1, 'typing the code in lower case still works');

  -- --- requesting, then accepting ------------------------------------------
  perform public.add_friend(code_a);
  select count(*) into n from public.friends where status = 'pending';
  perform pg_temp.want(n = 1, 'the request starts out pending');
  perform public.add_friend(code_a);
  select count(*) into n from public.friends;
  perform pg_temp.want(n = 1, 'asking twice does not make a second row');

  perform pg_temp.be(asha);
  select count(*) into n from public.profiles where user_id = bibek;
  perform pg_temp.want(n = 0, 'a pending request does not open your profile yet');

  -- Asha scans Bibek's code, which accepts his request rather than making a new one.
  perform public.add_friend(code_b);
  select count(*) into n from public.friends where status = 'accepted';
  perform pg_temp.want(n = 1, 'using the code of someone who asked you accepts them');

  select count(*) into n from public.profiles where user_id = bibek;
  perform pg_temp.want(n = 1, 'friends can read each other''s profile');
  perform pg_temp.be(chirag);
  select count(*) into n from public.profiles where user_id = asha;
  perform pg_temp.want(n = 0, 'someone outside the friendship still cannot');
  select count(*) into n from public.friends;
  perform pg_temp.want(n = 0, 'and cannot see that the friendship exists');

  -- --- attendance is a word, never a number --------------------------------
  perform pg_temp.be(bibek);
  select count(*) into n from public.my_people()
    where user_id = asha and attendance_state = 'safe';
  perform pg_temp.want(n = 1, 'a friend who shares attendance shows a state');
  perform pg_temp.be(asha);
  update public.profiles set share_attendance = false where user_id = asha;
  perform pg_temp.be(bibek);
  select count(*) into n from public.my_people() where user_id = asha and attendance_state is null;
  perform pg_temp.want(n = 1, 'turning sharing off hides it again');

  -- --- you cannot accept your own request ----------------------------------
  perform pg_temp.be(chirag);
  perform public.add_friend(code_b);                 -- Chirag asks Bibek
  update public.friends set status = 'accepted'
    where requested_by = chirag;                     -- Chirag tries to accept it himself
  select count(*) into n from public.friends where requested_by = chirag and status = 'accepted';
  perform pg_temp.want(n = 0, 'you cannot accept the request you sent');

  -- --- groups ---------------------------------------------------------------
  perform pg_temp.be(asha);
  gid := (public.create_group('CSE E2', '📚')).id;
  select code into gcode from public.groups where id = gid;
  perform pg_temp.want(gcode ~ '^[A-Z0-9]{6}$', 'a group gets a join code');
  select count(*) into n from public.group_people(gid);
  perform pg_temp.want(n = 1, 'the person who made it is in it');

  perform pg_temp.be(chirag);
  select count(*) into n from public.groups where id = gid;
  perform pg_temp.want(n = 0, 'a non-member cannot see the group');
  perform public.join_group(gcode);
  select count(*) into n from public.groups where id = gid;
  perform pg_temp.want(n = 1, 'joining with the code lets you in');
  perform public.join_group(gcode);
  select count(*) into n from public.group_people(gid);
  perform pg_temp.want(n = 2, 'joining twice does not duplicate you');

  begin
    perform public.join_group('ZZZZZZ');
    perform pg_temp.want(false, 'a wrong group code is refused');
  exception when others then
    perform pg_temp.want(sqlerrm = 'no_such_group', 'a wrong group code is refused');
  end;

  -- Being in a group makes you visible to the others in it.
  select count(*) into n from public.profiles where user_id = asha;
  perform pg_temp.want(n = 1, 'group mates can read each other''s profile');

  -- --- sharing an assignment to a group --------------------------------------
  perform pg_temp.be(asha);
  insert into public.shares (author, group_id, data, created_at, updated_at)
    values (asha, gid, '{"title":"DBMS assignment","dueDate":"2026-10-10"}'::jsonb, 1, 1)
    returning id into sid;

  perform pg_temp.be(chirag);
  select count(*) into n from public.shares where id = sid;
  perform pg_temp.want(n = 1, 'everyone in the group sees what was posted');

  perform pg_temp.be(bibek);                          -- a friend, but not in this group
  select count(*) into n from public.shares where id = sid;
  perform pg_temp.want(n = 0, 'someone outside the group does not');

  -- Only the author may withdraw it.
  perform pg_temp.be(chirag);
  delete from public.shares where id = sid;
  perform pg_temp.be(asha);
  select count(*) into n from public.shares where id = sid;
  perform pg_temp.want(n = 1, 'only the person who posted it can delete it');

  -- Nobody can post into a group they are not in.
  perform pg_temp.be(bibek);
  begin
    insert into public.shares (author, group_id, data, created_at, updated_at)
      values (bibek, gid, '{"title":"spam"}'::jsonb, 1, 1);
    perform pg_temp.want(false, 'you cannot post into a group you are not in');
  exception when insufficient_privilege then
    perform pg_temp.want(true, 'you cannot post into a group you are not in');
  end;

  -- And nobody can post as someone else.
  perform pg_temp.be(chirag);
  begin
    insert into public.shares (author, group_id, data, created_at, updated_at)
      values (asha, gid, '{"title":"not really from Asha"}'::jsonb, 1, 1);
    perform pg_temp.want(false, 'you cannot post under another name');
  exception when insufficient_privilege then
    perform pg_temp.want(true, 'you cannot post under another name');
  end;

  -- --- sharing with chosen friends -------------------------------------------
  perform pg_temp.be(asha);
  insert into public.shares (author, data, created_at, updated_at)
    values (asha, '{"title":"Just for Bibek"}'::jsonb, 1, 1) returning id into sid;
  insert into public.share_targets (share_id, user_id) values (sid, bibek);

  perform pg_temp.be(bibek);
  select count(*) into n from public.shares where id = sid;
  perform pg_temp.want(n = 1, 'a named friend receives it');
  perform pg_temp.be(chirag);
  select count(*) into n from public.shares where id = sid;
  perform pg_temp.want(n = 0, 'nobody else does');

  -- You may only name people you are friends with.
  perform pg_temp.be(asha);
  begin
    insert into public.share_targets (share_id, user_id) values (sid, chirag);
    perform pg_temp.want(false, 'you cannot send to someone who is not your friend');
  exception when insufficient_privilege then
    perform pg_temp.want(true, 'you cannot send to someone who is not your friend');
  end;

  -- --- leaving --------------------------------------------------------------
  perform pg_temp.be(chirag);
  delete from public.group_members where group_id = gid and user_id = chirag;
  select count(*) into n from public.groups where id = gid;
  perform pg_temp.want(n = 0, 'leaving a group closes it to you');

  raise notice 'ALL SOCIAL TESTS PASSED';
end $$;

reset role;

-- Sign-up follows whatever allowed_domain() says, and nothing else.
do $$
declare
  domain text := public.allowed_domain();
  blocked boolean := false;
begin
  begin
    insert into auth.users (id, email)
      values ('44444444-4444-4444-4444-444444444444', 'random@gmail.com');
  exception when others then
    blocked := true;
  end;

  if domain = '' then
    if blocked then raise exception 'FAILED: sign-up is open but an address was refused'; end if;
    raise notice 'ok: with no domain set, any address can sign up';
  else
    if not blocked then raise exception 'FAILED: sign-up is limited to @% but another address got in', domain; end if;
    raise notice 'ok: with a domain set, other addresses cannot sign up';
  end if;
end $$;
