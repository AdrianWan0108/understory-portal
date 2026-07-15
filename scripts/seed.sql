-- Run this entire file in the Supabase SQL Editor once.
-- It is safe to run again: existing Emilia tasks with these titles are skipped.

begin;

do $seed$
declare
  mvp_client_id clients.id%type;
  seeded_task_id tasks.id%type;
begin
  select id
  into mvp_client_id
  from clients
  where slug = 'mvp'
  limit 1;

  if mvp_client_id is null then
    insert into clients (name, slug)
    values ('Motion Vitality Pilates', 'mvp')
    returning id into mvp_client_id;
  end if;

  if not exists (
    select 1 from tasks
    where client_id = mvp_client_id
      and assignee = 'Emilia'
      and title = 'Rebrand launch carousel'
  ) then
    insert into tasks (
      client_id, assignee, title, brief, status, post_caption, ref_image_url
    ) values (
      mvp_client_id,
      'Emilia',
      'Rebrand launch carousel',
      $copy$Introduce the new logo and the MVP Studio / MVP Training brand split. Goal: make the rebrand feel exciting and clear, not just an announcement.$copy$,
      'not_started',
      $copy$New look, same heart. 🤍 We've spent the past few months reimagining how we show up for you — and today, we're excited to share it. Under one roof, you'll now find MVP Studio — beginner to advanced reformer and mat classes — and MVP Training, where clients go deeper through Polestar Pilates certification and Gyrotonic training, or take the next step into teaching. Same instructors, same community — just clearer about how we do it. Come see the new space. Link in bio to book your first class. #MotionVitalityPilates #Rebrand #PilatesStudio$copy$,
      'https://placehold.co/400x500/E4E9E3/294B3B?text=Rebrand%0Areference'
    ) returning id into seeded_task_id;

    insert into task_slides (
      task_id, slide_number, on_screen_text, visual_note, slide_caption, warning_flag, image_url
    ) values
      (seeded_task_id, 1, $copy$A new look, the same studio.$copy$, $copy$New logo, large close-up, clean background$copy$, $copy$Here it is — our new look.$copy$, null, null),
      (seeded_task_id, 2, $copy$Motion creates vitality. Everyone is our MVP.$copy$, $copy$Brand mark or simple typographic slide — clean, centered tagline treatment, brand color background$copy$, $copy$This is what we stand for.$copy$, null, null),
      (seeded_task_id, 3, $copy$MVP Studio — where your Pilates journey begins. / Beginner · Intermediate · Advanced reformer & mat classes, for every stage of your practice.$copy$, $copy$Reformer or mat class photo, ideally showing different class levels side by side$copy$, $copy$MVP Studio: reformer & mat, every level welcome.$copy$, null, null),
      (seeded_task_id, 4, $copy$MVP Training — for those going further. / Polestar Pilates certification. Gyrotonic training. Programs for clients ready to deepen their practice — or become instructors themselves.$copy$, $copy$Training/teaching photo showing the range of programs$copy$, $copy$MVP Training: go deeper, or become an instructor.$copy$, null, null),
      (seeded_task_id, 5, $copy$Same instructors. Same community. Just clearer about how we show up for you.$copy$, $copy$Warm studio environment photo$copy$, null, null, null),
      (seeded_task_id, 6, $copy$Come see it for yourself. Link in bio.$copy$, $copy$Studio photo, welcoming tone$copy$, $copy$See you soon 🤍$copy$, null, null);
  end if;

  if not exists (
    select 1 from tasks
    where client_id = mvp_client_id
      and assignee = 'Emilia'
      and title = 'Pilates myth-busting carousel'
  ) then
    insert into tasks (
      client_id, assignee, title, brief, status, post_caption, ref_image_url
    ) values (
      mvp_client_id,
      'Emilia',
      'Pilates myth-busting carousel',
      $copy$Correct the 'Pilates is just stretching' misconception using the Hundred as a concrete example. Goal: educational, positions MVP as knowledgeable.$copy$,
      'not_started',
      $copy$Let's clear this one up. 👀 Pilates isn't a gentle stretch class — it's precise, controlled, full-body strength work. Take "the Hundred": it looks simple, but it's building deep core endurance with every pulse. Every cue we teach is grounded in Polestar's rehab-based method — so you build real strength, safely, from day one. If you've been curious but held back thinking it's "just stretching" — this is your sign to try it. #PilatesMyths #PolestarPilates #MotionVitalityPilates$copy$,
      'https://placehold.co/400x500/E9E0D9/4C4038?text=Myth-busting%0Areference'
    ) returning id into seeded_task_id;

    insert into task_slides (
      task_id, slide_number, on_screen_text, visual_note, slide_caption, warning_flag, image_url
    ) values
      (seeded_task_id, 1, $copy$"Pilates is just stretching." / Let's break this down. →$copy$, $copy$Dynamic reformer action shot, not a static pose$copy$, $copy$A myth we hear a lot.$copy$, null, null),
      (seeded_task_id, 2, $copy$Pilates ≠ stretching. / It's a full-body strength system built on control — every movement targets your deep core.$copy$, $copy$Simple icon pair — passive stretch vs. controlled strength$copy$, null, null, null),
      (seeded_task_id, 3, $copy$Take the Hundred. / Looks like breathing and pulsing — but it's building core endurance and control from the inside out.$copy$, $copy$Photo/still of the Hundred, small arrow indicating core engagement$copy$, $copy$One of our foundational moves.$copy$, null, null),
      (seeded_task_id, 4, $copy$That's the Polestar difference. / Every cue is grounded in rehab science — so you build real strength, safely.$copy$, $copy$Small Polestar/MVP certification badge or logo element$copy$, null, null, null),
      (seeded_task_id, 5, $copy$Feel it for yourself. / Book your first class — link in bio.$copy$, $copy$Warm studio or smiling client photo$copy$, $copy$Ready when you are.$copy$, null, null);
  end if;

  if not exists (
    select 1 from tasks
    where client_id = mvp_client_id
      and assignee = 'Emilia'
      and title = 'What is Polestar Pilates carousel'
  ) then
    insert into tasks (
      client_id, assignee, title, brief, status, post_caption, ref_image_url
    ) values (
      mvp_client_id,
      'Emilia',
      'What is Polestar Pilates carousel',
      $copy$Explain what Polestar certification means through Gary and Dorothy's training, build credibility, and end with a CTA for the upcoming Teacher Training Program.$copy$,
      'not_started',
      $copy$Ever wondered what "Polestar Pilates" means on our schedule? 🧠 Polestar is one of the most respected Pilates certifications in the world — rooted in rehabilitation science, not trends. Gary and Dorothy are Polestar-certified, trained to understand how your body actually moves and to teach accordingly. And if you've ever thought about going further — our Polestar Teacher Training Program is opening enrollment soon. Link in bio for details. #PolestarPilates #MotionVitalityPilates #TeacherTraining$copy$,
      'https://placehold.co/400x500/DDE8E8/314F53?text=Polestar%0Areference'
    ) returning id into seeded_task_id;

    insert into task_slides (
      task_id, slide_number, on_screen_text, visual_note, slide_caption, warning_flag, image_url
    ) values
      (seeded_task_id, 1, $copy$You're taking a Polestar Pilates class. But what does that actually mean?$copy$, $copy$Clean text-forward slide, brand colors$copy$, null, null, null),
      (seeded_task_id, 2, $copy$Polestar is an internationally recognized Pilates method — grounded in rehabilitation science and biomechanics.$copy$, $copy$Simple supporting graphic, optional$copy$, null, null, null),
      (seeded_task_id, 3, $copy$Gary and Dorothy are Polestar-certified, trained to teach with precision and adapt to every body.$copy$, $copy$Instructor teaching photo$copy$, null, $copy$Confirm exact wording with Gary/Dorothy before publishing$copy$, null),
      (seeded_task_id, 4, $copy$Want to go deeper? Our Polestar Teacher Training Program is opening enrollment soon. / Whether you want to teach or simply understand your practice on a whole new level — this is for you.$copy$, $copy$Teaching/training photo, aspirational tone$copy$, $copy$Enrollment opening soon 👀$copy$, null, null),
      (seeded_task_id, 5, $copy$Evidence-based teaching, every class. / Link in bio to learn more about the Teacher Training Program.$copy$, $copy$Studio or class photo$copy$, null, null, null);
  end if;

  if not exists (
    select 1 from tasks
    where client_id = mvp_client_id
      and assignee = 'Emilia'
      and title = 'Gary founder story carousel'
  ) then
    insert into tasks (
      client_id, assignee, title, brief, status, post_caption, ref_image_url
    ) values (
      mvp_client_id,
      'Emilia',
      'Gary founder story carousel',
      $copy$Gary shares why he started MVP — personal, trust-building tone from the owner's perspective.$copy$,
      'not_started',
      $copy$A few words from our founder. 🤍 "I didn't start MVP to build another fitness studio — I started it because I wanted people to walk in and feel like they belonged, whether it was their first class or their five-hundredth. That's still what drives every decision we make here." — Gary Come feel it for yourself. Link in bio to book. #MotionVitalityPilates #FounderStory #PilatesCommunity$copy$,
      'https://placehold.co/400x500/E7E0E8/4B3F50?text=Founder+story%0Areference'
    ) returning id into seeded_task_id;

    insert into task_slides (
      task_id, slide_number, on_screen_text, visual_note, slide_caption, warning_flag, image_url
    ) values
      (seeded_task_id, 1, $copy$Why I started Motion Vitality Pilates.$copy$, $copy$Portrait photo of Gary$copy$, null, $copy$Needs Gary photo — schedule shoot if unavailable$copy$, null),
      (seeded_task_id, 2, $copy$I wanted a space where people didn't just get stronger — they felt seen. Every instructor here trains with that in mind.$copy$, $copy$Simple text slide, warm tone, brand colors$copy$, null, null, null),
      (seeded_task_id, 3, $copy$Come find out what that feels like. / Link in bio.$copy$, $copy$Studio or community photo$copy$, $copy$Come feel it for yourself.$copy$, null, null);
  end if;
end
$seed$;

commit;
