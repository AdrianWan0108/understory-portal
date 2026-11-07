-- Loads the MVP Anniversary Week plan (Mon Nov 23 to Fri Nov 27, 2026) as of
-- Nov 7, 2026. Owners update items on the Events board from then on.
-- Skipped if a plan with the same title already exists.
begin;

do $$
declare
  v_plan uuid;
begin
  if exists (select 1 from public.event_plans where title = 'MVP Anniversary Week 2026') then
    return;
  end if;

  insert into public.event_plans (client_id, title, start_date, end_date, timezone, status, slack_target, notes)
  values (
    (select id from public.clients where slug = 'mvp' limit 1),
    'MVP Anniversary Week 2026', '2026-11-23', '2026-11-27', 'America/Toronto', 'planning', 'mvp',
    'Rehab talks Mon/Wed/Fri, Movement Check Day Tue, Anniversary Celebration Thu. October partners are not being told about the date change (decided Nov 5). Every email is shown as a draft first.'
  ) returning id into v_plan;

  insert into public.event_plan_items (plan_id, sort_order, phase, kind, title, owner, due_date, status, blocker, waiting_on, notes, completed_at) values
    (v_plan, 10, '1. Decide (Nov 5–9)', 'task', 'Confirm Lianne (physio) as a speaker', 'Karen', '2026-11-05', 'done', null, null, null, '2026-11-05T12:00:00Z'),
    (v_plan, 20, '1. Decide (Nov 5–9)', 'task', 'Email partners and sponsors (Cornerstone, Woodbine Foot Clinic, BioPed, Kintech, First Markham, new leads)', 'Karen', '2026-11-07', 'done', null, null, null, '2026-11-07T12:00:00Z'),
    (v_plan, 30, '1. Decide (Nov 5–9)', 'decision', 'Gary decides: classes and sizes, anniversary price on the $89 intro, bring-a-friend and partner code, comp classes for influencers, goodie bag and Meta ads budget', 'Gary', '2026-11-09', 'waiting', null, 'Gary', 'Blocks Mindbody setup, the poster and influencer DMs.', null),
    (v_plan, 40, '1. Decide (Nov 5–9)', 'task', 'Call Giacomo (647-208-0375) to confirm MJ Yeung (Mon) and May Liu (Wed) talks', 'Karen', '2026-11-09', 'waiting', null, 'Giacomo (emailed Nov 7)', 'Mon and Wed programme depends on this.', null),
    (v_plan, 50, '1. Decide (Nov 5–9)', 'task', 'Tell Lianne her talk moves to Fri Nov 27 and confirm time and topic', 'Karen', '2026-11-09', 'todo', null, null, null, null),
    (v_plan, 60, '2. Set up (Nov 9–10)', 'task', 'Set up classes and the intro offer in Mindbody, open trial bookings', 'Karen', '2026-11-10', 'blocked', 'Needs Gary''s decisions on classes and price.', null, null, null),
    (v_plan, 70, '2. Set up (Nov 9–10)', 'task', 'Make the poster (English + Chinese) and the flyer', 'Karen', '2026-11-10', 'blocked', 'Needs the price and class schedule from Gary.', null, null, null),
    (v_plan, 80, '2. Set up (Nov 9–10)', 'task', 'DM 10–15 local IG and Xiaohongshu creators (goal 3–5 visits before the event)', 'Karen', '2026-11-12', 'blocked', 'Gary has not set the number of comp classes.', null, 'DM drafts are ready with [X] for the number of classes.', null),
    (v_plan, 90, '3. Announce (Nov 10–13)', 'task', 'Send the Mindbody email to past clients', 'Karen', '2026-11-13', 'todo', null, null, null, null),
    (v_plan, 100, '3. Announce (Nov 10–13)', 'task', 'Post on IG/FB, WeChat, WhatsApp and Xiaohongshu', 'Karen', '2026-11-13', 'todo', null, null, null, null),
    (v_plan, 110, '3. Announce (Nov 10–13)', 'task', 'Add the event on Google Business Profile', 'Karen', '2026-11-13', 'todo', null, null, null, null),
    (v_plan, 120, '3. Announce (Nov 10–13)', 'task', 'Call or visit Healthy Planet and Revitasize about sponsoring', 'Karen', '2026-11-13', 'todo', null, null, 'Markham Podiatry is the backup sponsor.', null),
    (v_plan, 130, '3. Announce (Nov 10–13)', 'reminder', 'Replies due from HealthyToDos and Carefirst (new leads)', 'Event Planner', '2026-11-12', 'waiting', null, 'HealthyToDos, Carefirst', null, null),
    (v_plan, 140, '3. Announce (Nov 10–13)', 'reminder', 'Replies due from Giacomo, Woodbine Foot Clinic, BioPed, Kintech and First Markham', 'Event Planner', '2026-11-13', 'waiting', null, 'Partners and sponsors emailed Nov 7', null, null),
    (v_plan, 150, '4. Promote (Nov 14–20)', 'task', 'Post 2–3 times a week: behind the scenes, an intro to Lianne, a class preview', 'Karen', '2026-11-20', 'todo', null, null, null, null),
    (v_plan, 160, '4. Promote (Nov 14–20)', 'task', 'Drop flyers at nearby cafés and at partners who replied', 'Karen', '2026-11-20', 'todo', null, null, null, null),
    (v_plan, 170, '4. Promote (Nov 14–20)', 'task', 'Optional Meta ads, 5–10 km (Nov 16–26)', 'Karen', '2026-11-16', 'todo', null, null, 'Needs Gary''s ads budget.', null),
    (v_plan, 180, '4. Promote (Nov 14–20)', 'task', 'Order goodie bag items (bands, movement cards, offer cards)', 'Karen', '2026-11-20', 'todo', null, null, null, null),
    (v_plan, 190, '5. Final prep (Nov 21–22)', 'task', 'Send a reminder email to everyone who booked', 'Karen', '2026-11-21', 'todo', null, null, null, null),
    (v_plan, 200, '5. Final prep (Nov 21–22)', 'task', 'Check the class list and staffing', 'Gary', '2026-11-22', 'todo', null, null, null, null),
    (v_plan, 210, '6. Event week (Nov 23–27)', 'milestone', 'Mon: Rehab Talk with MJ Yeung (scoliosis), then a Gary workshop', 'Gary', '2026-11-23', 'todo', null, null, 'Speaker not confirmed yet.', null),
    (v_plan, 220, '6. Event week (Nov 23–27)', 'milestone', 'Tue: Movement Check Day (trial classes, 20-minute assessments, bring-a-friend)', 'Gary', '2026-11-24', 'todo', null, null, null, null),
    (v_plan, 230, '6. Event week (Nov 23–27)', 'milestone', 'Wed: Rehab Talk with May Liu (persistent pain), then a Gary workshop', 'Gary', '2026-11-25', 'todo', null, null, 'Speaker not confirmed yet.', null),
    (v_plan, 240, '6. Event week (Nov 23–27)', 'milestone', 'Thu: Anniversary Celebration (open house, community class, sponsor raffle, influencer filming)', 'Gary', '2026-11-26', 'todo', null, null, null, null),
    (v_plan, 250, '6. Event week (Nov 23–27)', 'milestone', 'Fri: Rehab Talk with Lianne, then a Gary workshop; Black Friday tie-in', 'Gary', '2026-11-27', 'todo', null, null, null, null),
    (v_plan, 260, '7. Follow up (Nov 28–Dec 2)', 'task', 'Follow up with every guest within 48 hours, then again on day 5', 'Karen', '2026-11-29', 'todo', null, null, null, null),
    (v_plan, 270, '7. Follow up (Nov 28–Dec 2)', 'reminder', 'Anniversary perks end', 'Karen', '2026-11-30', 'todo', null, null, null, null);
end $$;

commit;
