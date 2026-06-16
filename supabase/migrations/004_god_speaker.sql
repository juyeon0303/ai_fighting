-- 사용자(신) 토론 개입 메시지
alter table debate_messages drop constraint if exists debate_messages_persona_id_check;

alter table debate_messages add constraint debate_messages_persona_id_check
  check (persona_id in (
    'atlas', 'cipher', 'ember',
    'pro', 'con', 'neutral', 'moderator',
    'god'
  ));
