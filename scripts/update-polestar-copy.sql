-- Run this file in the Supabase SQL Editor if scripts/seed.sql was run before
-- the Polestar certification wording was corrected. It is safe to run again.

begin;

update tasks
set
  brief = $copy$Explain what Polestar certification means through Gary and Dorothy's training, build credibility, and end with a CTA for the upcoming Teacher Training Program.$copy$,
  post_caption = $copy$Ever wondered what "Polestar Pilates" means on our schedule? 🧠 Polestar is one of the most respected Pilates certifications in the world — rooted in rehabilitation science, not trends. Gary and Dorothy are Polestar-certified, trained to understand how your body actually moves and to teach accordingly. And if you've ever thought about going further — our Polestar Teacher Training Program is opening enrollment soon. Link in bio for details. #PolestarPilates #MotionVitalityPilates #TeacherTraining$copy$
from clients
where tasks.client_id = clients.id
  and clients.slug = 'mvp'
  and tasks.assignee = 'Emilia'
  and tasks.title = 'What is Polestar Pilates carousel';

update task_slides
set on_screen_text = $copy$Gary and Dorothy are Polestar-certified, trained to teach with precision and adapt to every body.$copy$
from tasks, clients
where task_slides.task_id = tasks.id
  and tasks.client_id = clients.id
  and clients.slug = 'mvp'
  and tasks.assignee = 'Emilia'
  and tasks.title = 'What is Polestar Pilates carousel'
  and task_slides.slide_number = 3;

commit;
