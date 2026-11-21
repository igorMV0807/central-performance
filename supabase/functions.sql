-- Database functions used by the automation system.
-- No credentials or customer data are included.
-- Review privileges before deploying and keep privileged functions off the public API.

CREATE OR REPLACE FUNCTION public.apply_copy_screening_evaluation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  version_a_sent integer := coalesce((new.champion_metrics ->> 'sent')::integer, 0);
  version_b_sent integer := coalesce((new.challenger_metrics ->> 'sent')::integer, 0);
  required_per_version integer;
begin
  if new.platform not in ('perfectpay', 'hotmart') then
    return new;
  end if;

  select e.minimum_sends_per_variant
  into required_per_version
  from public.copy_experiments e
  where e.id = new.experiment_id
    and e.platform = new.platform
    and e.status = 'running'
    and e.primary_metric = 'click_rate'
  for update;

  if found
     and version_a_sent >= required_per_version
     and version_b_sent >= required_per_version
     and new.decision <> 'insufficient_data' then
    update public.copy_experiments
    set status = 'paused',
        winner_variant_id = null,
        decision_reason = new.reason,
        ended_at = coalesce(new.window_end, new.evaluated_at, now()),
        updated_at = now()
    where id = new.experiment_id;

    update public.copy_tournament_candidates
    set status = 'completed',
        updated_at = now()
    where experiment_id = new.experiment_id;
  end if;

  return new;
end
$function$


CREATE OR REPLACE FUNCTION public.apply_email_suppression_to_journeys()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.active = true and new.normalized_email is not null and new.normalized_email <> '' then
    update public.purchase_journeys
       set recovery_allowed = false,
           next_step_at = null,
           updated_at = now()
     where lower(trim(buyer_email)) = new.normalized_email
       and recovery_allowed = true;

    update public.perfectpay_journeys
       set recovery_allowed = false,
           next_step_at = null,
           updated_at = now()
     where lower(trim(customer_email)) = new.normalized_email
       and recovery_allowed = true;
  end if;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.assign_default_copy_variant()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare selected record; previous_assignment public.copy_experiment_assignments%rowtype;
begin
 if new.copy_variant_id is not null then return new; end if;
 select * into selected from public.copy_select_variant('hotmart',new.recovery_flow,new.step,new.journey_id) limit 1;
 new.copy_experiment_id:=selected.experiment_id; new.copy_variant_id:=selected.variant_id; new.copy_variant_role:=selected.assigned_group;
 if selected.experiment_id is not null then
  select a.* into previous_assignment from public.copy_experiment_assignments a where a.platform='hotmart' and a.experiment_id=selected.experiment_id and a.journey_id=new.journey_id and a.step=new.step limit 1;
  if found then new.copy_variant_id:=previous_assignment.variant_id; new.copy_variant_role:=previous_assignment.assigned_group;
  else
   insert into public.copy_experiment_assignments(platform,experiment_id,journey_id,step,variant_id,assigned_group) values('hotmart',selected.experiment_id,new.journey_id,new.step,selected.variant_id,selected.assigned_group) on conflict(experiment_id,journey_id,step) do nothing;
   select a.* into previous_assignment from public.copy_experiment_assignments a where a.experiment_id=selected.experiment_id and a.journey_id=new.journey_id and a.step=new.step limit 1;
   if found then new.copy_variant_id:=previous_assignment.variant_id; new.copy_variant_role:=previous_assignment.assigned_group; end if;
  end if;
 end if;
 return new;
end $function$


CREATE OR REPLACE FUNCTION public.assign_perfectpay_copy_variant()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare selected record; previous_assignment public.copy_experiment_assignments%rowtype;
begin
 if new.copy_variant_id is not null then return new; end if;
 select * into selected from public.copy_select_variant('perfectpay',new.recovery_flow,new.step,new.journey_id) limit 1;
 new.copy_experiment_id:=selected.experiment_id; new.copy_variant_id:=selected.variant_id; new.copy_variant_role:=selected.assigned_group;
 if selected.experiment_id is not null then
  select a.* into previous_assignment from public.copy_experiment_assignments a where a.platform='perfectpay' and a.experiment_id=selected.experiment_id and a.journey_id=new.journey_id and a.step=new.step limit 1;
  if found then new.copy_variant_id:=previous_assignment.variant_id; new.copy_variant_role:=previous_assignment.assigned_group;
  else
   insert into public.copy_experiment_assignments(platform,experiment_id,journey_id,step,variant_id,assigned_group) values('perfectpay',selected.experiment_id,new.journey_id,new.step,selected.variant_id,selected.assigned_group) on conflict(experiment_id,journey_id,step) do nothing;
   select a.* into previous_assignment from public.copy_experiment_assignments a where a.experiment_id=selected.experiment_id and a.journey_id=new.journey_id and a.step=new.step limit 1;
   if found then new.copy_variant_id:=previous_assignment.variant_id; new.copy_variant_role:=previous_assignment.assigned_group; end if;
  end if;
 end if;
 return new;
end $function$


CREATE OR REPLACE FUNCTION public.attribute_recovery_conversion()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  matched_log public.recovery_email_logs%rowtype;
  conversion_time timestamp with time zone;
  event_revenue numeric;
  event_currency text;
  final_revenue numeric;
  final_currency text;
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if upper(coalesce(new.current_status, '')) not in ('APPROVED', 'COMPLETE', 'COMPLETED')
     or new.transaction_id is null
     or btrim(new.transaction_id) = '' then
    return new;
  end if;

  conversion_time := coalesce(new.approved_at, new.completed_at, now());

  select rel.*
  into matched_log
  from public.recovery_email_logs rel
  where rel.journey_id = new.id
    and rel.status = 'SENT'
    and rel.last_clicked_at is not null
    and rel.last_clicked_at <= conversion_time
    and rel.last_clicked_at >= conversion_time - interval '30 days'
  order by rel.last_clicked_at desc, rel.id desc
  limit 1;

  if not found then
    update public.purchase_journeys
    set
      recovered = false,
      recovered_step = null,
      recovered_revenue = null
    where id = new.id
      and (
        recovered is distinct from false
        or recovered_step is not null
        or recovered_revenue is not null
      );

    return new;
  end if;

  select he.price, he.currency
  into event_revenue, event_currency
  from public.hotmart_events he
  where he.event_id = new.last_event_id
  limit 1;

  final_revenue := coalesce(event_revenue, new.recovered_revenue);
  final_currency := coalesce(event_currency, new.currency);

  update public.purchase_journeys
  set
    recovered = true,
    recovered_step = matched_log.step,
    recovered_revenue = final_revenue
  where id = new.id
    and (
      recovered is distinct from true
      or recovered_step is distinct from matched_log.step
      or recovered_revenue is distinct from final_revenue
    );

  insert into public.recovery_conversions (
    email_log_id,
    journey_id,
    recovery_flow,
    step,
    transaction_id,
    purchase_event_id,
    revenue,
    currency,
    clicked_at,
    converted_at,
    attribution_model
  )
  values (
    matched_log.id,
    new.id,
    matched_log.recovery_flow,
    matched_log.step,
    new.transaction_id,
    new.last_event_id,
    final_revenue,
    final_currency,
    matched_log.last_clicked_at,
    conversion_time,
    'last_click_30d'
  )
  on conflict (transaction_id) do update
  set
    email_log_id = excluded.email_log_id,
    journey_id = excluded.journey_id,
    recovery_flow = excluded.recovery_flow,
    step = excluded.step,
    purchase_event_id = excluded.purchase_event_id,
    revenue = excluded.revenue,
    currency = excluded.currency,
    clicked_at = excluded.clicked_at,
    converted_at = excluded.converted_at,
    attribution_model = excluded.attribution_model,
    updated_at = now();

  update public.recovery_email_logs
  set
    converted_at = coalesce(converted_at, conversion_time),
    conversion_transaction_id = new.transaction_id,
    converted_revenue = final_revenue,
    conversion_currency = final_currency
  where id = matched_log.id;

  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.carry_forward_recovery_progress()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_prev_step integer := 0;
begin
  if new.recovery_allowed = true and coalesce(new.buyer_email,'') <> '' then
    select coalesce(max(j.last_step_sent),0)
      into v_prev_step
      from public.purchase_journeys j
     where lower(trim(j.buyer_email)) = lower(trim(new.buyer_email))
       and j.product_id = new.product_id
       and coalesce(j.offer_code,'') = coalesce(new.offer_code,'')
       and j.id <> coalesce(new.id,-1)
       and j.created_at >= now() - interval '7 days';

    if v_prev_step > coalesce(new.last_step_sent,0) then
      new.last_step_sent := v_prev_step;
      if v_prev_step >= 3 then
        new.recovery_allowed := false;
        new.next_step_at := null;
      else
        new.next_step_at := now() + interval '1 day';
      end if;
    end if;
  end if;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.claim_email_unsubscribe(p_token uuid)
 RETURNS TABLE(success boolean, email text, platform text, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_row public.email_unsubscribe_tokens%rowtype;
begin
  select *
  into v_row
  from public.email_unsubscribe_tokens
  where token = p_token
  for update;

  if not found then
    return query select false, null::text, null::text, 'invalid_token'::text;
    return;
  end if;

  if v_row.used_at is not null then
    return query select true, v_row.email, v_row.platform, 'already_unsubscribed'::text;
    return;
  end if;

  if v_row.expires_at <= now() then
    return query select false, v_row.email, v_row.platform, 'expired_token'::text;
    return;
  end if;

  insert into public.email_suppressions (
    email,
    platform,
    reason,
    source,
    active,
    metadata,
    suppressed_at,
    updated_at
  )
  values (
    v_row.email,
    v_row.platform,
    'unsubscribe',
    'email_link',
    true,
    jsonb_build_object(
      'token', v_row.token,
      'source_table', v_row.source_table,
      'source_email_log_id', v_row.source_email_log_id
    ),
    now(),
    now()
  )
  on conflict on constraint email_suppressions_platform_email_key
  do update set
    active = true,
    reason = 'unsubscribe',
    source = 'email_link',
    metadata = excluded.metadata,
    suppressed_at = now(),
    updated_at = now();

  update public.email_unsubscribe_tokens
  set used_at = now()
  where token = p_token;

  return query select true, v_row.email, v_row.platform, 'unsubscribed'::text;
end;
$function$


CREATE OR REPLACE FUNCTION public.copy_laboratory_action(p_experiment_id uuid, p_action text, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  selected_experiment public.copy_experiments%rowtype;
  selected_challenger public.copy_variants%rowtype;
  latest_evaluation public.copy_evaluations%rowtype;
  normalized_action text := lower(btrim(p_action));
  next_test jsonb := null;
begin
  if p_actor is null then
    raise exception 'Usuário autenticado inválido.';
  end if;

  select e.* into selected_experiment
  from public.copy_experiments e
  where e.id=p_experiment_id
  for update;

  if not found then
    raise exception 'Experimento não encontrado.';
  end if;

  select v.* into selected_challenger
  from public.copy_variants v
  where v.id=selected_experiment.challenger_variant_id
  for update;

  if normalized_action='approve_start' then
    if selected_experiment.status not in ('shadow','manual_review','ready','paused') then
      raise exception 'Este experimento não pode ser iniciado no estado atual.';
    end if;
    if not selected_challenger.qa_passed then
      raise exception 'A copy desafiante ainda não passou pela validação.';
    end if;

    update public.copy_variants
       set status='running',
           approved_by=p_actor,
           approved_at=coalesce(approved_at,now()),
           activated_at=coalesce(activated_at,now()),
           updated_at=now()
     where id=selected_experiment.challenger_variant_id;

    update public.copy_experiments
       set status='running',
           started_at=coalesce(started_at,now()),
           ended_at=null,
           decision_reason='Teste aprovado e iniciado manualmente pelo dashboard.',
           updated_at=now()
     where id=p_experiment_id;

    update public.copy_tournament_candidates
       set status='testing',updated_at=now()
     where experiment_id=p_experiment_id;

    update public.copy_laboratory_settings
       set mode='manual_approval',updated_at=now()
     where id=true;

  elsif normalized_action='pause' then
    if selected_experiment.status<>'running' then
      raise exception 'Somente um teste em andamento pode ser pausado.';
    end if;

    update public.copy_experiments
       set status='paused',
           decision_reason='Teste pausado manualmente pelo dashboard.',
           updated_at=now()
     where id=p_experiment_id;

    update public.copy_variants
       set status='approved',updated_at=now()
     where id=selected_experiment.challenger_variant_id;

  elsif normalized_action='resume' then
    if selected_experiment.status not in ('paused','ready') then
      raise exception 'Somente um teste pausado ou pronto pode ser retomado.';
    end if;

    update public.copy_experiments
       set status='running',
           started_at=coalesce(started_at,now()),
           ended_at=null,
           decision_reason='Teste retomado manualmente pelo dashboard.',
           updated_at=now()
     where id=p_experiment_id;

    update public.copy_variants
       set status='running',
           activated_at=coalesce(activated_at,now()),
           updated_at=now()
     where id=selected_experiment.challenger_variant_id;

    update public.copy_tournament_candidates
       set status='testing',updated_at=now()
     where experiment_id=p_experiment_id;

  elsif normalized_action='reject' then
    if selected_experiment.status in ('completed','cancelled') then
      raise exception 'Este experimento já foi encerrado.';
    end if;

    update public.copy_experiments
       set status='cancelled',
           ended_at=now(),
           decision_reason='Copy desafiante rejeitada manualmente pelo dashboard.',
           updated_at=now()
     where id=p_experiment_id;

    update public.copy_variants
       set role='rejected',
           status='rejected',
           archived_at=now(),
           updated_at=now()
     where id=selected_experiment.challenger_variant_id;

    update public.copy_tournament_candidates
       set status='skipped',updated_at=now()
     where experiment_id=p_experiment_id;

    next_test := public.copy_tournament_prepare_next(
      selected_experiment.platform,selected_experiment.recovery_flow,selected_experiment.step,p_actor
    );

  elsif normalized_action in ('promote','keep_champion') then
    select ev.* into latest_evaluation
    from public.copy_evaluations ev
    where ev.experiment_id=p_experiment_id
    order by ev.evaluated_at desc,ev.id desc
    limit 1;

    if not found then
      raise exception 'Ainda não existe avaliação suficiente para encerrar o teste.';
    end if;

    if normalized_action='promote' and latest_evaluation.decision<>'challenger_wins' then
      raise exception 'A avaliação atual ainda não autoriza promover a desafiante.';
    end if;

    if normalized_action='keep_champion' and latest_evaluation.decision<>'champion_wins' then
      raise exception 'A avaliação atual ainda não autoriza encerrar com a campeã.';
    end if;

    if normalized_action='promote' then
      update public.copy_variants
         set role='archived',status='archived',archived_at=now(),updated_at=now()
       where id=selected_experiment.champion_variant_id;

      update public.copy_variants
         set role='champion',status='winner',approval_required=false,
             approved_by=p_actor,approved_at=coalesce(approved_at,now()),
             activated_at=coalesce(activated_at,now()),archived_at=null,updated_at=now()
       where id=selected_experiment.challenger_variant_id;

      update public.copy_experiments
         set status='completed',winner_variant_id=selected_experiment.challenger_variant_id,
             ended_at=now(),
             decision_reason=coalesce(latest_evaluation.reason,'Desafiante promovida após avaliação mínima.'),
             updated_at=now()
       where id=p_experiment_id;

      update public.copy_evaluations
         set promoted=(id=latest_evaluation.id)
       where experiment_id=p_experiment_id;
    else
      update public.copy_variants
         set role='archived',status='loser',archived_at=now(),updated_at=now()
       where id=selected_experiment.challenger_variant_id;

      update public.copy_experiments
         set status='completed',winner_variant_id=selected_experiment.champion_variant_id,
             ended_at=now(),
             decision_reason=coalesce(latest_evaluation.reason,'Controle mantido após avaliação mínima.'),
             updated_at=now()
       where id=p_experiment_id;
    end if;

    update public.copy_tournament_candidates
       set status='completed',updated_at=now()
     where experiment_id=p_experiment_id;

    next_test := public.copy_tournament_prepare_next(
      selected_experiment.platform,selected_experiment.recovery_flow,selected_experiment.step,p_actor
    );
  else
    raise exception 'Ação inválida.';
  end if;

  return jsonb_build_object(
    'experiment_id',p_experiment_id,
    'action',normalized_action,
    'status',(select status from public.copy_experiments where id=p_experiment_id),
    'next_test',next_test
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.copy_laboratory_save_asset(p_asset_type text, p_title text, p_content text, p_source_url text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  normalized_type text := lower(btrim(p_asset_type));
  new_id bigint;
begin
  if normalized_type not in ('video_transcript', 'offer_rules', 'brand_rules', 'legacy_copy') then
    raise exception 'Tipo de material inválido.';
  end if;
  if length(btrim(coalesce(p_title, ''))) < 3 then
    raise exception 'Informe um título válido.';
  end if;
  if length(btrim(coalesce(p_content, ''))) < 20 then
    raise exception 'O conteúdo precisa ter pelo menos 20 caracteres.';
  end if;

  update public.copy_laboratory_assets
     set is_active = false,
         updated_at = now()
   where asset_type = normalized_type
     and is_active = true;

  insert into public.copy_laboratory_assets (
    asset_type,
    title,
    content,
    source_url,
    is_active,
    metadata
  )
  values (
    normalized_type,
    btrim(p_title),
    btrim(p_content),
    nullif(btrim(coalesce(p_source_url, '')), ''),
    true,
    jsonb_build_object('saved_from', 'dashboard')
  )
  returning id into new_id;

  return new_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.copy_laboratory_track_evaluated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  update public.copy_laboratory_settings
     set last_evaluated_at = greatest(
           coalesce(last_evaluated_at, '-infinity'::timestamptz),
           coalesce(new.evaluated_at, now())
         ),
         updated_at = now()
   where id = true;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.copy_laboratory_track_generated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.generated_by is not null
     and new.generated_by not in ('seed', 'manual_original', 'migration') then
    update public.copy_laboratory_settings
       set last_generated_at = greatest(
             coalesce(last_generated_at, '-infinity'::timestamptz),
             coalesce(new.created_at, now())
           ),
           updated_at = now()
     where id = true;
  end if;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.copy_review_variant(p_variant_id uuid, p_action text, p_actor uuid, p_subject text DEFAULT NULL::text, p_preheader text DEFAULT NULL::text, p_body text DEFAULT NULL::text, p_button_text text DEFAULT NULL::text, p_footer text DEFAULT NULL::text, p_hypothesis text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  selected_variant public.copy_variants%rowtype;
  control_variant public.copy_variants%rowtype;
  existing_open public.copy_experiments%rowtype;
  created_experiment public.copy_experiments%rowtype;
  normalized_action text := lower(btrim(coalesce(p_action, '')));
  next_subject text;
  next_preheader text;
  next_body text;
  next_button text;
  next_footer text;
  next_hypothesis text;
  joined_text text;
  expected_comma text;
  expected_dot text;
  next_sequence integer;
begin
  if p_actor is null then
    raise exception 'Usuário autenticado inválido.';
  end if;

  select v.* into selected_variant
  from public.copy_variants v
  where v.id = p_variant_id
  for update;

  if not found then
    raise exception 'Rascunho não encontrado.';
  end if;

  if selected_variant.platform <> 'perfectpay' then
    raise exception 'Somente rascunhos da PerfectPay podem ser revisados aqui.';
  end if;

  if normalized_action not in ('save', 'approve', 'reject') then
    raise exception 'Ação de revisão inválida.';
  end if;

  if normalized_action = 'reject' then
    if selected_variant.status in ('running', 'winner') then
      raise exception 'Esta copy já está em uso e não pode ser rejeitada como rascunho.';
    end if;

    update public.copy_variants
       set role = 'rejected',
           status = 'rejected',
           archived_at = now(),
           updated_at = now()
     where id = p_variant_id;

    update public.copy_tournament_candidates
       set status = 'skipped',
           updated_at = now()
     where variant_id = p_variant_id
       and status in ('queued', 'manual_review');

    return jsonb_build_object(
      'variant_id', p_variant_id,
      'action', normalized_action,
      'status', 'rejected'
    );
  end if;

  if selected_variant.approved_at is not null or selected_variant.status not in ('draft', 'qa_passed') then
    raise exception 'Este rascunho já foi decidido ou não está disponível para edição.';
  end if;

  next_subject := btrim(coalesce(p_subject, selected_variant.subject));
  next_preheader := btrim(coalesce(p_preheader, selected_variant.preheader));
  next_body := btrim(coalesce(p_body, selected_variant.body));
  next_button := btrim(coalesce(p_button_text, selected_variant.button_text));
  next_footer := btrim(coalesce(p_footer, selected_variant.footer, ''));
  next_hypothesis := btrim(coalesce(p_hypothesis, selected_variant.hypothesis, ''));

  if next_subject = '' or next_preheader = '' or next_body = '' or next_button = '' then
    raise exception 'Assunto, preheader, corpo e botão são obrigatórios.';
  end if;
  if position('[nome]' in next_subject) = 0 or position('[nome]' in next_body) = 0 then
    raise exception 'Use o marcador [nome] no assunto e no corpo.';
  end if;

  joined_text := next_subject || ' ' || next_preheader || ' ' || next_body || ' ' || next_button || ' ' || next_footer;

  if joined_text ~* 'https?://' then
    raise exception 'Não inclua links na copy. O Motor adiciona o checkout rastreado ao botão.';
  end if;
  if joined_text ~* '[a-z0-9._%+-]+@[a-z0-9.-]+[.][a-z]{2,}' then
    raise exception 'A copy contém um endereço de e-mail. Remova dados pessoais antes de salvar.';
  end if;

  if selected_variant.displayed_price is not null then
    expected_dot := trim(to_char(selected_variant.displayed_price, 'FM999999990.00'));
    expected_comma := replace(expected_dot, '.', ',');
    if position(expected_dot in joined_text) = 0 and position(expected_comma in joined_text) = 0 then
      raise exception 'A condição correta de R$ % precisa aparecer na copy.', expected_comma;
    end if;
  elsif joined_text ~* 'r[$][[:space:]]*[0-9]' then
    raise exception 'Este e-mail não possui desconto; remova o preço promocional.';
  end if;

  update public.copy_variants
     set subject = next_subject,
         preheader = next_preheader,
         body = next_body,
         button_text = next_button,
         footer = next_footer,
         hypothesis = nullif(next_hypothesis, ''),
         role = 'challenger',
         status = 'qa_passed',
         qa_passed = true,
         qa_report = coalesce(qa_report, '{}'::jsonb) || jsonb_build_object(
           'last_human_edit_at', now(),
           'technical_validation', 'passed',
           'content_freedom', true
         ),
         updated_at = now()
   where id = p_variant_id;

  if normalized_action = 'save' then
    return jsonb_build_object(
      'variant_id', p_variant_id,
      'action', normalized_action,
      'status', 'qa_passed'
    );
  end if;

  select v.* into control_variant
  from public.copy_variants v
  where v.id = selected_variant.parent_variant_id
    and v.platform = 'perfectpay'
    and v.recovery_flow = selected_variant.recovery_flow
    and v.step = selected_variant.step
    and v.id <> selected_variant.id
  limit 1;

  if not found then
    select v.* into control_variant
    from public.copy_variants v
    where v.platform = 'perfectpay'
      and v.recovery_flow = selected_variant.recovery_flow
      and v.step = selected_variant.step
      and v.role = 'champion'
      and v.archived_at is null
      and v.id <> selected_variant.id
    order by v.version_number desc
    limit 1;
  end if;

  if control_variant.id is null then
    raise exception 'Não foi encontrada uma versão A válida para este teste.';
  end if;

  select e.* into existing_open
  from public.copy_experiments e
  where e.platform = 'perfectpay'
    and e.recovery_flow = selected_variant.recovery_flow
    and e.step = selected_variant.step
    and e.status in ('shadow', 'manual_review', 'ready', 'running', 'paused')
  order by e.created_at desc
  for update
  limit 1;

  if found then
    if existing_open.status = 'running' then
      raise exception 'Já existe um teste em andamento para este e-mail. Aguarde o encerramento antes de aprovar outra copy.';
    end if;

    update public.copy_experiments
       set status = 'cancelled',
           ended_at = now(),
           decision_reason = 'Rodada anterior encerrada ao aprovar um novo rascunho no dashboard.',
           updated_at = now()
     where id = existing_open.id;

    update public.copy_tournament_candidates
       set status = 'completed',
           updated_at = now()
     where experiment_id = existing_open.id
       and status in ('manual_review', 'testing');

    if existing_open.challenger_variant_id <> control_variant.id then
      update public.copy_variants
         set role = 'archived',
             status = 'archived',
             archived_at = coalesce(archived_at, now()),
             updated_at = now()
       where id = existing_open.challenger_variant_id
         and role <> 'champion';
    end if;
  end if;

  insert into public.copy_experiments (
    platform,
    recovery_flow,
    step,
    champion_variant_id,
    challenger_variant_id,
    status,
    traffic_challenger_percent,
    primary_metric,
    minimum_sends_per_variant,
    minimum_purchases_total,
    decision_reason,
    started_at
  ) values (
    'perfectpay',
    selected_variant.recovery_flow,
    selected_variant.step,
    control_variant.id,
    selected_variant.id,
    'running',
    50,
    'click_rate',
    10,
    0,
    'Rascunho editado e aprovado pelo usuário. Triagem 50/50 com 10 envios por versão e sem promoção automática.',
    now()
  )
  returning * into created_experiment;

  update public.copy_variants
     set role = 'challenger',
         status = 'running',
         approved_by = p_actor,
         approved_at = now(),
         activated_at = now(),
         archived_at = null,
         updated_at = now()
   where id = p_variant_id;

  select coalesce(max(q.sequence_number), 0) + 1
    into next_sequence
  from public.copy_tournament_candidates q
  where q.platform = 'perfectpay'
    and q.recovery_flow = selected_variant.recovery_flow
    and q.step = selected_variant.step;

  insert into public.copy_tournament_candidates (
    platform,
    recovery_flow,
    step,
    variant_id,
    angle,
    sequence_number,
    stage,
    status,
    experiment_id
  ) values (
    'perfectpay',
    selected_variant.recovery_flow,
    selected_variant.step,
    selected_variant.id,
    'human_reviewed_ai_draft',
    next_sequence,
    'screening',
    'testing',
    created_experiment.id
  )
  on conflict (variant_id) do update
    set status = 'testing',
        experiment_id = excluded.experiment_id,
        updated_at = now();

  update public.copy_laboratory_settings
     set mode = 'manual_approval',
         automatic_promotion = false,
         updated_at = now()
   where id = true;

  return jsonb_build_object(
    'variant_id', p_variant_id,
    'action', normalized_action,
    'status', 'running',
    'experiment_id', created_experiment.id,
    'control_variant_id', control_variant.id
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.copy_select_variant(p_platform text, p_recovery_flow text, p_step integer, p_journey_id bigint)
 RETURNS TABLE(experiment_id uuid, variant_id uuid, assigned_group text)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  selected_experiment public.copy_experiments%rowtype;
  stable_bucket integer;
  normalized_platform text := lower(btrim(coalesce(p_platform, '')));
  normalized_flow text := upper(btrim(coalesce(p_recovery_flow, '')));
  version_a_count integer := 0;
  version_b_count integer := 0;
  per_version_limit integer := 0;
begin
  if normalized_platform not in ('hotmart', 'perfectpay') then
    raise exception 'Plataforma de copy inválida';
  end if;

  select e.*
  into selected_experiment
  from public.copy_experiments e
  where e.platform = normalized_platform
    and e.recovery_flow = normalized_flow
    and e.step = p_step
    and e.status = 'running'
  order by e.started_at desc nulls last, e.created_at desc
  limit 1
  for update;

  if found then
    stable_bucket := ((('x' || substr(md5(selected_experiment.id::text || ':' || p_journey_id::text || ':' || p_step::text), 1, 8))::bit(32)::bigint) % 100)::integer;
    experiment_id := selected_experiment.id;

    if normalized_platform in ('perfectpay', 'hotmart')
       and selected_experiment.primary_metric = 'click_rate' then
      per_version_limit := greatest(1, selected_experiment.minimum_sends_per_variant);

      if normalized_platform = 'perfectpay' then
        select
          count(*) filter (where l.copy_variant_id = selected_experiment.champion_variant_id),
          count(*) filter (where l.copy_variant_id = selected_experiment.challenger_variant_id)
        into version_a_count, version_b_count
        from public.perfectpay_email_logs l
        where l.copy_experiment_id = selected_experiment.id
          and upper(coalesce(l.status, '')) in ('CLAIMED', 'SENT', 'FAILED');
      else
        select
          count(*) filter (where l.copy_variant_id = selected_experiment.champion_variant_id),
          count(*) filter (where l.copy_variant_id = selected_experiment.challenger_variant_id)
        into version_a_count, version_b_count
        from public.recovery_email_logs l
        where l.copy_experiment_id = selected_experiment.id
          and upper(coalesce(l.status, '')) in ('CLAIMED', 'SENT', 'FAILED');
      end if;

      if version_a_count >= per_version_limit and version_b_count >= per_version_limit then
        experiment_id := null;
        variant_id := selected_experiment.champion_variant_id;
        assigned_group := 'champion';
        return next;
        return;
      elsif version_a_count >= per_version_limit then
        variant_id := selected_experiment.challenger_variant_id;
        assigned_group := 'challenger';
      elsif version_b_count >= per_version_limit then
        variant_id := selected_experiment.champion_variant_id;
        assigned_group := 'champion';
      elsif stable_bucket < 50 then
        variant_id := selected_experiment.challenger_variant_id;
        assigned_group := 'challenger';
      else
        variant_id := selected_experiment.champion_variant_id;
        assigned_group := 'champion';
      end if;

      return next;
      return;
    end if;

    if stable_bucket < selected_experiment.traffic_challenger_percent then
      variant_id := selected_experiment.challenger_variant_id;
      assigned_group := 'challenger';
    else
      variant_id := selected_experiment.champion_variant_id;
      assigned_group := 'champion';
    end if;
    return next;
    return;
  end if;

  if normalized_platform in ('perfectpay', 'hotmart') then
    select
      case
        when e.decision_reason like '[TRIAGEM] Versão B promissora:%' then e.challenger_variant_id
        else e.champion_variant_id
      end
    into variant_id
    from public.copy_experiments e
    where e.platform = normalized_platform
      and e.recovery_flow = normalized_flow
      and e.step = p_step
      and e.status = 'paused'
      and e.primary_metric = 'click_rate'
      and e.ended_at is not null
    order by e.ended_at desc, e.created_at desc
    limit 1;
  end if;

  if variant_id is null then
    select v.id
    into variant_id
    from public.copy_variants v
    where v.platform = normalized_platform
      and v.recovery_flow = normalized_flow
      and v.step = p_step
      and v.role = 'champion'
      and v.archived_at is null
    order by v.version_number desc
    limit 1;
  end if;

  experiment_id := null;
  assigned_group := 'champion';
  return next;
end
$function$


CREATE OR REPLACE FUNCTION public.copy_select_variant(p_recovery_flow text, p_step integer, p_journey_id bigint)
 RETURNS TABLE(experiment_id uuid, variant_id uuid, assigned_group text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ select * from public.copy_select_variant('hotmart',p_recovery_flow,p_step,p_journey_id); $function$


CREATE OR REPLACE FUNCTION public.copy_tournament_prepare_next(p_platform text, p_recovery_flow text, p_step integer, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  normalized_platform text := lower(btrim(coalesce(p_platform,'')));
  normalized_flow text := upper(btrim(coalesce(p_recovery_flow,'')));
  selected_candidate public.copy_tournament_candidates%rowtype;
  selected_variant public.copy_variants%rowtype;
  selected_control public.copy_variants%rowtype;
  created_experiment public.copy_experiments%rowtype;
begin
  if p_actor is null then
    raise exception 'Usuário autenticado inválido.';
  end if;

  if exists (
    select 1
    from public.copy_experiments e
    where e.platform=normalized_platform
      and e.recovery_flow=normalized_flow
      and e.step=p_step
      and e.status in ('shadow','manual_review','ready','running','paused')
  ) then
    return jsonb_build_object('status','waiting_for_current');
  end if;

  select q.*
    into selected_candidate
    from public.copy_tournament_candidates q
   where q.platform=normalized_platform
     and q.recovery_flow=normalized_flow
     and q.step=p_step
     and q.status='queued'
   order by q.sequence_number
   for update skip locked
   limit 1;

  if not found then
    return jsonb_build_object('status','queue_complete');
  end if;

  select v.*
    into selected_variant
    from public.copy_variants v
   where v.id=selected_candidate.variant_id
     and v.platform=normalized_platform
     and v.recovery_flow=normalized_flow
     and v.step=p_step
     and v.qa_passed=true
     and v.archived_at is null;

  if not found then
    update public.copy_tournament_candidates
       set status='skipped',updated_at=now()
     where id=selected_candidate.id;
    return jsonb_build_object('status','candidate_invalid','candidate_id',selected_candidate.id);
  end if;

  select v.*
    into selected_control
    from public.copy_variants v
   where v.platform=normalized_platform
     and v.recovery_flow=normalized_flow
     and v.step=p_step
     and v.role='champion'
     and v.archived_at is null
   order by v.version_number desc
   limit 1;

  if not found then
    raise exception 'Copy de controle não encontrada.';
  end if;

  insert into public.copy_experiments (
    platform,recovery_flow,step,champion_variant_id,challenger_variant_id,
    status,traffic_challenger_percent,primary_metric,
    minimum_sends_per_variant,minimum_purchases_total,decision_reason
  ) values (
    normalized_platform,normalized_flow,p_step,selected_control.id,selected_variant.id,
    'manual_review',50,'revenue_per_sent',
    case when selected_candidate.stage='confirmation' then 100 else 50 end,
    case when selected_candidate.stage='confirmation' then 10 else 5 end,
    'Rodada do torneio preparada automaticamente; exige aprovação humana.'
  )
  returning * into created_experiment;

  update public.copy_tournament_candidates
     set status='manual_review',experiment_id=created_experiment.id,updated_at=now()
   where id=selected_candidate.id;

  return jsonb_build_object(
    'status','manual_review',
    'candidate_id',selected_candidate.id,
    'experiment_id',created_experiment.id,
    'sequence_number',selected_candidate.sequence_number,
    'stage',selected_candidate.stage
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.deactivate_older_active_recovery_journeys()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.recovery_allowed = true then
    update public.purchase_journeys j
       set recovery_allowed = false,
           next_step_at = null,
           updated_at = now()
     where j.id <> new.id
       and j.recovery_allowed = true
       and lower(trim(j.buyer_email)) = lower(trim(new.buyer_email))
       and j.product_id = new.product_id
       and coalesce(j.offer_code,'') = coalesce(new.offer_code,'');
  end if;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.enforce_email_suppression_on_hotmart_journey()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if exists (
    select 1
    from public.email_suppressions s
    where s.active = true
      and s.normalized_email = lower(trim(coalesce(new.buyer_email,'')))
      and s.platform in ('global','hotmart')
  ) then
    new.recovery_allowed := false;
    new.next_step_at := null;
  end if;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.enforce_email_suppression_on_perfectpay_journey()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if exists (
    select 1
    from public.email_suppressions s
    where s.active = true
      and s.normalized_email = lower(trim(coalesce(new.customer_email,'')))
      and s.platform in ('global','perfectpay')
  ) then
    new.recovery_allowed := false;
    new.next_step_at := null;
  end if;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.hotmart_claim_delivery(p_transaction_id text, p_journey_id bigint, p_customer_email text, p_customer_name text, p_product_id text, p_product_name text)
 RETURNS SETOF hotmart_delivery_logs
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  return query
  insert into public.hotmart_delivery_logs (
    transaction_id, journey_id, customer_email, customer_name, product_id, product_name
  )
  values (
    p_transaction_id, p_journey_id, p_customer_email, p_customer_name, p_product_id, p_product_name
  )
  on conflict (transaction_id) do nothing
  returning *;
end;
$function$


CREATE OR REPLACE FUNCTION public.hotmart_claim_due_deliveries(p_limit integer DEFAULT 10)
 RETURNS SETOF hotmart_delivery_logs
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  return query
  insert into public.hotmart_delivery_logs (
    transaction_id,
    journey_id,
    customer_email,
    customer_name,
    product_id,
    product_name
  )
  select
    e.transaction_id,
    j.id,
    lower(trim(e.buyer_email)),
    e.buyer_name,
    e.product_id,
    coalesce(e.payload_raw #>> '{data,product,name}', 'Jornada Devocional de São Miguel')
  from public.hotmart_events e
  left join lateral (
    select pj.id
    from public.purchase_journeys pj
    where pj.transaction_id = e.transaction_id
    order by pj.id desc
    limit 1
  ) j on true
  where e.product_id = '1000000'
    and e.event_type = 'PURCHASE_APPROVED'
    and e.processed = true
    and nullif(trim(e.transaction_id), '') is not null
    and nullif(trim(e.buyer_email), '') is not null
    and not exists (
      select 1
      from public.hotmart_delivery_logs existing
      where existing.transaction_id = e.transaction_id
    )
  order by e.created_at
  limit greatest(1, least(coalesce(p_limit, 10), 50))
  on conflict (transaction_id) do nothing
  returning *;

  return query
  with due as (
    select id
    from public.hotmart_delivery_logs
    where status = 'FAILED'
      and attempt_count < 3
      and next_retry_at is not null
      and next_retry_at <= now()
    order by next_retry_at, id
    limit greatest(1, least(coalesce(p_limit, 10), 50))
    for update skip locked
  )
  update public.hotmart_delivery_logs h
  set status = 'CLAIMED',
      attempt_count = h.attempt_count + 1,
      claimed_at = now(),
      error_message = null,
      updated_at = now()
  from due
  where h.id = due.id
  returning h.*;
end;
$function$


CREATE OR REPLACE FUNCTION public.hotmart_mark_delivery_failed(p_delivery_log_id bigint, p_error_message text)
 RETURNS SETOF hotmart_delivery_logs
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  return query
  update public.hotmart_delivery_logs
  set status = 'FAILED',
      error_message = left(coalesce(p_error_message, 'Falha na entrega Hotmart'), 1000),
      next_retry_at = case
        when attempt_count = 1 then now() + interval '5 minutes'
        when attempt_count = 2 then now() + interval '30 minutes'
        else null
      end,
      updated_at = now()
  where id = p_delivery_log_id
  returning *;
end;
$function$


CREATE OR REPLACE FUNCTION public.hotmart_mark_delivery_pdfs_sent(p_delivery_log_id bigint, p_gmail_message_id text)
 RETURNS SETOF hotmart_delivery_logs
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  return query
  update public.hotmart_delivery_logs
  set gmail_message_id_pdfs = p_gmail_message_id,
      updated_at = now()
  where id = p_delivery_log_id
  returning *;
end;
$function$


CREATE OR REPLACE FUNCTION public.hotmart_mark_delivery_sent(p_delivery_log_id bigint, p_gmail_message_id text)
 RETURNS SETOF hotmart_delivery_logs
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  return query
  update public.hotmart_delivery_logs
  set status = 'SENT',
      gmail_message_id_audios = p_gmail_message_id,
      sent_at = now(),
      next_retry_at = null,
      error_message = null,
      updated_at = now()
  where id = p_delivery_log_id
  returning *;
end;
$function$


CREATE OR REPLACE FUNCTION public.is_email_suppressed(p_email text, p_platform text DEFAULT 'hotmart'::text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (
    select 1
    from public.email_suppressions s
    where s.normalized_email = lower(btrim(p_email))
      and s.active = true
      and s.platform in (p_platform, 'global')
  );
$function$


CREATE OR REPLACE FUNCTION public.issue_email_unsubscribe_token(p_email text, p_platform text DEFAULT 'hotmart'::text, p_source_table text DEFAULT NULL::text, p_source_email_log_id bigint DEFAULT NULL::bigint)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_token uuid;
begin
  if nullif(btrim(p_email), '') is null then
    raise exception 'email_required';
  end if;

  if p_platform not in ('hotmart', 'perfectpay') then
    raise exception 'invalid_platform';
  end if;

  insert into public.email_unsubscribe_tokens (
    email,
    platform,
    source_table,
    source_email_log_id
  )
  values (
    btrim(p_email),
    p_platform,
    p_source_table,
    p_source_email_log_id
  )
  returning token into v_token;

  return v_token;
end;
$function$


CREATE OR REPLACE FUNCTION public.perfectpay_apply_email_log_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_email_2_delay integer := 24;
  v_email_3_delay integer := 24;
begin
  if new.status = 'SENT' and old.status is distinct from 'SENT' then
    select s.email_2_delay_hours, s.email_3_delay_hours
      into v_email_2_delay, v_email_3_delay
    from public.perfectpay_settings s
    where s.id = true;

    update public.perfectpay_journeys j
    set last_step_sent = greatest(j.last_step_sent, new.step),
        next_step_at = case
          when not j.recovery_allowed or j.recovered then null
          when new.step = 1 then now() + make_interval(hours => coalesce(v_email_2_delay, 24))
          when new.step = 2 then now() + make_interval(hours => coalesce(v_email_3_delay, 24))
          else null
        end,
        updated_at = now()
    where j.id = new.journey_id;
  elsif new.status = 'FAILED'
        and old.status is distinct from 'FAILED'
        and new.attempt_count >= 3 then
    update public.perfectpay_journeys j
    set recovery_allowed = false,
        next_step_at = null,
        stopped_at = coalesce(j.stopped_at, now()),
        updated_at = now()
    where j.id = new.journey_id;
  end if;
  return null;
end
$function$


CREATE OR REPLACE FUNCTION public.perfectpay_claim_delivery(p_sale_code text, p_customer_email text DEFAULT NULL::text, p_customer_name text DEFAULT NULL::text, p_product_code text DEFAULT NULL::text, p_product_name text DEFAULT NULL::text)
 RETURNS TABLE(delivery_log_id bigint, sale_code text, customer_email text, customer_name text, product_code text, product_name text, attempt_count integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  insert into public.perfectpay_delivery_logs (
    sale_code,
    journey_id,
    customer_email,
    customer_name,
    product_code,
    product_name,
    status,
    attempt_count,
    next_retry_at,
    claimed_at,
    updated_at
  )
  select
    j.sale_code,
    j.id,
    lower(j.customer_email),
    coalesce(j.customer_name, nullif(trim(p_customer_name), '')),
    j.product_code,
    coalesce(j.product_name, nullif(trim(p_product_name), '')),
    'CLAIMED',
    1,
    null,
    now(),
    now()
  from public.perfectpay_journeys j
  join public.perfectpay_settings s
    on s.id = true
   and s.enabled = true
  where j.sale_code = nullif(trim(p_sale_code), '')
    and j.current_status_enum in (2, 8, 10)
    and j.customer_email is not null
    and lower(j.customer_email) = lower(coalesce(nullif(trim(p_customer_email), ''), j.customer_email))
    and (s.product_code is null or j.product_code = s.product_code)
    and (nullif(trim(p_product_code), '') is null or j.product_code = nullif(trim(p_product_code), ''))
  on conflict (sale_code) do update
    set status = 'CLAIMED',
        attempt_count = public.perfectpay_delivery_logs.attempt_count + 1,
        next_retry_at = null,
        error_message = null,
        claimed_at = now(),
        updated_at = now()
    where public.perfectpay_delivery_logs.status = 'FAILED'
      and public.perfectpay_delivery_logs.attempt_count < 3
      and coalesce(public.perfectpay_delivery_logs.next_retry_at, now()) <= now()
  returning
    perfectpay_delivery_logs.id,
    perfectpay_delivery_logs.sale_code,
    perfectpay_delivery_logs.customer_email,
    perfectpay_delivery_logs.customer_name,
    perfectpay_delivery_logs.product_code,
    perfectpay_delivery_logs.product_name,
    perfectpay_delivery_logs.attempt_count;
$function$


CREATE OR REPLACE FUNCTION public.perfectpay_claim_due_deliveries(p_limit integer DEFAULT 10)
 RETURNS TABLE(delivery_log_id bigint, sale_code text, customer_email text, customer_name text, product_code text, product_name text, attempt_count integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with due as (
    select d.id
    from public.perfectpay_delivery_logs d
    where d.status = 'FAILED'
      and d.attempt_count < 3
      and d.next_retry_at is not null
      and d.next_retry_at <= now()
    order by d.next_retry_at, d.id
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 50))
  )
  update public.perfectpay_delivery_logs d
  set status = 'CLAIMED',
      attempt_count = d.attempt_count + 1,
      next_retry_at = null,
      error_message = null,
      claimed_at = now(),
      updated_at = now()
  from due
  where d.id = due.id
  returning
    d.id,
    d.sale_code,
    d.customer_email,
    d.customer_name,
    d.product_code,
    d.product_name,
    d.attempt_count;
$function$


CREATE OR REPLACE FUNCTION public.perfectpay_claim_due_recoveries(p_limit integer DEFAULT 50)
 RETURNS TABLE(email_log_id bigint, journey_id bigint, customer_email text, customer_name text, recovery_flow text, step smallint, checkout_url text, tracking_token uuid, mode text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  return query
  with config as (
    select *
    from public.perfectpay_settings s
    where s.id = true and s.enabled = true
  ),
  due as (
    select
      j.id as journey_id,
      (j.last_step_sent + 1)::smallint as next_step,
      l.id as existing_log_id
    from public.perfectpay_journeys j
    cross join config c
    left join public.perfectpay_email_logs l
      on l.journey_id = j.id
     and l.recovery_flow = j.recovery_flow
     and l.step = (j.last_step_sent + 1)::smallint
    where j.recovery_allowed = true
      and j.recovered = false
      and j.last_step_sent < 3
      and j.next_step_at is not null
      and j.next_step_at <= now()
      and (c.product_code is null or j.product_code = c.product_code)
      and (c.plan_code is null or j.plan_code = c.plan_code)
      and (
        l.id is null
        or (
          l.status = 'FAILED'
          and l.attempt_count < 3
          and coalesce(l.next_retry_at, now()) <= now()
        )
      )
    order by j.next_step_at, j.id
    for update of j skip locked
    limit greatest(1, least(coalesce(p_limit, 50), 200))
  ),
  new_logs as (
    insert into public.perfectpay_email_logs (
      journey_id, recovery_flow, step, customer_email,
      checkout_url, status, attempt_count, next_retry_at
    )
    select
      j.id,
      j.recovery_flow,
      d.next_step,
      j.customer_email,
      case
        when d.next_step = 1 then c.normal_checkout_url
        when j.recovery_flow in ('WAITING_PAYMENT', 'DELAYED') then c.normal_checkout_url
        when d.next_step = 2 then c.coupon_1_checkout_url
        when d.next_step = 3 then c.coupon_2_checkout_url
        else c.normal_checkout_url
      end,
      case when c.mode = 'shadow' then 'SHADOW' else 'CLAIMED' end,
      1,
      null
    from due d
    join public.perfectpay_journeys j on j.id = d.journey_id
    cross join config c
    where d.existing_log_id is null
    on conflict on constraint perfectpay_email_logs_journey_id_recovery_flow_step_key do nothing
    returning *
  ),
  retried_logs as (
    update public.perfectpay_email_logs l
    set status = case when c.mode = 'shadow' then 'SHADOW' else 'CLAIMED' end,
        attempt_count = l.attempt_count + 1,
        claimed_at = now(),
        next_retry_at = null,
        error_message = null,
        updated_at = now()
    from due d
    cross join config c
    where d.existing_log_id = l.id
      and l.status = 'FAILED'
      and l.attempt_count < 3
      and coalesce(l.next_retry_at, now()) <= now()
    returning l.*
  ),
  claimed as (
    select * from new_logs
    union all
    select * from retried_logs
  ),
  advanced_shadow as (
    update public.perfectpay_journeys j
    set last_step_sent = c.step,
        next_step_at = case
          when c.step = 1 then now() + make_interval(hours => cfg.email_2_delay_hours)
          when c.step = 2 then now() + make_interval(hours => cfg.email_3_delay_hours)
          else null
        end,
        shadow_mode = true,
        updated_at = now()
    from claimed c
    cross join config cfg
    where cfg.mode = 'shadow'
      and j.id = c.journey_id
    returning j.id
  )
  select
    c.id,
    c.journey_id,
    c.customer_email,
    j.customer_name,
    c.recovery_flow,
    c.step,
    c.checkout_url,
    c.tracking_token,
    cfg.mode
  from claimed c
  join public.perfectpay_journeys j on j.id = c.journey_id
  cross join config cfg;
end
$function$


CREATE OR REPLACE FUNCTION public.perfectpay_get_selected_copy(p_email_log_id bigint)
 RETURNS TABLE(email_log_id bigint, journey_id bigint, customer_email text, customer_name text, recovery_flow text, step smallint, checkout_url text, tracking_token uuid, run_mode text, copy_variant_id uuid, copy_variant_role text, copy_experiment_id uuid, subject text, preheader text, body text, button_text text, footer text, offer_code text, original_price numeric, displayed_price numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  picked record;
  v_variant uuid;
  v_experiment uuid;
  v_role text;
  v_journey bigint;
  v_flow text;
  v_step smallint;
begin
  select l.copy_variant_id,l.copy_experiment_id,l.copy_variant_role,l.journey_id,l.recovery_flow,l.step
  into v_variant,v_experiment,v_role,v_journey,v_flow,v_step
  from public.perfectpay_email_logs l where l.id=p_email_log_id for update;

  if not found then raise exception 'Registro PerfectPay não encontrado'; end if;

  if v_variant is null then
    select * into picked from public.copy_select_variant('perfectpay',v_flow,v_step,v_journey) limit 1;
    if picked.variant_id is null then raise exception 'Copy PerfectPay não configurada'; end if;
    v_variant:=picked.variant_id; v_experiment:=picked.experiment_id; v_role:=picked.assigned_group;
    update public.perfectpay_email_logs l
      set copy_variant_id=v_variant,copy_experiment_id=v_experiment,copy_variant_role=v_role,updated_at=now()
      where l.id=p_email_log_id;
  end if;

  return query
  select l.id,l.journey_id,l.customer_email,j.customer_name,l.recovery_flow,l.step,
         l.checkout_url,l.tracking_token,s.mode,l.copy_variant_id,l.copy_variant_role,l.copy_experiment_id,
         v.subject,v.preheader,v.body,v.button_text,v.footer,v.offer_code,v.original_price,v.displayed_price
  from public.perfectpay_email_logs l
  join public.perfectpay_journeys j on j.id=l.journey_id
  join public.copy_variants v on v.id=l.copy_variant_id and v.platform='perfectpay'
  cross join public.perfectpay_settings s
  where l.id=p_email_log_id and s.id=true;
end
$function$


CREATE OR REPLACE FUNCTION public.perfectpay_ingest_event(p_payload jsonb, p_received_at timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_result jsonb;
  v_journey_id bigint;
  v_journey public.perfectpay_journeys%rowtype;
  v_mode text := 'shadow';
  v_sent_log public.perfectpay_email_logs%rowtype;
  v_sale_code text;
begin
  v_result := public.perfectpay_ingest_event_core(p_payload, p_received_at);

  if coalesce((v_result->>'duplicate')::boolean, false) then
    return v_result;
  end if;

  v_journey_id := nullif(v_result->>'journey_id', '')::bigint;
  if v_journey_id is null then
    return v_result;
  end if;

  select coalesce(s.mode, 'shadow')
    into v_mode
  from public.perfectpay_settings s
  where s.id = true;

  select *
    into v_journey
  from public.perfectpay_journeys j
  where j.id = v_journey_id
  for update;

  update public.perfectpay_journeys
  set shadow_mode = (coalesce(v_mode, 'shadow') = 'shadow'),
      updated_at = now()
  where id = v_journey_id
  returning * into v_journey;

  if v_journey.current_status_enum in (2, 8, 10) then
    update public.perfectpay_email_logs l
    set status = 'SKIPPED',
        error_message = 'Envio cancelado: compra aprovada para este cliente e produto',
        updated_at = now()
    where l.journey_id in (
      select j.id
      from public.perfectpay_journeys j
      where j.id <> v_journey.id
        and lower(j.customer_email) = lower(v_journey.customer_email)
        and j.product_code is not distinct from v_journey.product_code
        and j.recovery_allowed = true
    )
      and l.status in ('CLAIMED', 'FAILED');

    update public.perfectpay_journeys j
    set recovery_allowed = false,
        next_step_at = null,
        stopped_at = coalesce(j.stopped_at, p_received_at),
        updated_at = now()
    where j.id <> v_journey.id
      and lower(j.customer_email) = lower(v_journey.customer_email)
      and j.product_code is not distinct from v_journey.product_code
      and j.recovery_allowed = true;

    select l.*
      into v_sent_log
    from public.perfectpay_email_logs l
    join public.perfectpay_journeys sj on sj.id = l.journey_id
    where lower(sj.customer_email) = lower(v_journey.customer_email)
      and sj.product_code is not distinct from v_journey.product_code
      and l.status = 'SENT'
      and l.sent_at >= p_received_at - interval '30 days'
    order by l.sent_at desc, l.id desc
    limit 1;

    v_sale_code := v_journey.sale_code;

    if found and v_sale_code is not null then
      update public.perfectpay_journeys
      set recovered = true,
          recovered_step = v_sent_log.step,
          recovered_revenue = coalesce(v_journey.sale_amount, recovered_revenue),
          recovery_allowed = false,
          next_step_at = null,
          stopped_at = coalesce(stopped_at, p_received_at),
          updated_at = now()
      where id = v_sent_log.journey_id;

      insert into public.perfectpay_conversions (
        email_log_id, journey_id, recovery_flow, step, sale_code,
        revenue, currency, clicked_at, converted_at
      )
      values (
        v_sent_log.id,
        v_sent_log.journey_id,
        v_sent_log.recovery_flow,
        v_sent_log.step,
        v_sale_code,
        v_journey.sale_amount,
        coalesce(v_journey.currency, 'BRL'),
        v_sent_log.last_clicked_at,
        p_received_at
      )
      on conflict (sale_code) do nothing;

      update public.perfectpay_email_logs
      set converted_at = p_received_at,
          updated_at = now()
      where id = v_sent_log.id;
    end if;

  elsif v_journey.recovery_allowed then
    if exists (
      select 1
      from public.perfectpay_journeys a
      where a.id <> v_journey.id
        and lower(a.customer_email) = lower(v_journey.customer_email)
        and a.product_code is not distinct from v_journey.product_code
        and a.current_status_enum in (2, 8, 10)
    ) then
      update public.perfectpay_email_logs
      set status = 'SKIPPED',
          error_message = 'Envio cancelado: cliente já comprou este produto',
          updated_at = now()
      where journey_id = v_journey.id
        and status in ('CLAIMED', 'FAILED');

      update public.perfectpay_journeys
      set recovery_allowed = false,
          next_step_at = null,
          stopped_at = coalesce(stopped_at, p_received_at),
          updated_at = now()
      where id = v_journey.id
      returning * into v_journey;
    else
      update public.perfectpay_email_logs l
      set status = 'SKIPPED',
          error_message = 'Envio cancelado: substituído por uma jornada mais recente',
          updated_at = now()
      where l.journey_id in (
        select j.id
        from public.perfectpay_journeys j
        where j.id <> v_journey.id
          and lower(j.customer_email) = lower(v_journey.customer_email)
          and j.product_code is not distinct from v_journey.product_code
          and j.recovery_allowed = true
      )
        and l.status in ('CLAIMED', 'FAILED');

      update public.perfectpay_journeys j
      set recovery_allowed = false,
          next_step_at = null,
          stopped_at = coalesce(j.stopped_at, p_received_at),
          updated_at = now()
      where j.id <> v_journey.id
        and lower(j.customer_email) = lower(v_journey.customer_email)
        and j.product_code is not distinct from v_journey.product_code
        and j.recovery_allowed = true;
    end if;
  end if;

  return v_result || jsonb_build_object(
    'recovery_allowed', v_journey.recovery_allowed,
    'mode', case when v_journey.shadow_mode then 'shadow' else 'live' end
  );
end
$function$


CREATE OR REPLACE FUNCTION public.perfectpay_ingest_event_core(p_payload jsonb, p_received_at timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_status integer;
  v_status_name text;
  v_flow text;
  v_recoverable boolean;
  v_terminal boolean;
  v_approved boolean;
  v_sale_code text;
  v_email text;
  v_name text;
  v_phone text;
  v_country text;
  v_product_code text;
  v_product_name text;
  v_plan_code text;
  v_plan_name text;
  v_event_source_time text;
  v_event_key text;
  v_identity_key text;
  v_amount numeric;
  v_currency text;
  v_payment_type integer;
  v_payment_method integer;
  v_coupon text;
  v_sanitized jsonb;
  v_event_id bigint;
  v_journey public.perfectpay_journeys%rowtype;
  v_log_id bigint;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'invalid PerfectPay payload';
  end if;

  v_status := public.perfectpay_safe_integer(coalesce(
    p_payload->>'sale_status_enum',
    p_payload#>>'{sale,sale_status_enum}',
    p_payload#>>'{sale,status_enum}',
    p_payload->>'status_enum',
    ''
  ));

  if v_status is null or v_status not between 1 and 16 then
    raise exception 'sale_status_enum missing or invalid';
  end if;

  v_sale_code := nullif(trim(coalesce(
    p_payload->>'code',
    p_payload#>>'{sale,code}',
    p_payload->>'sale_code',
    ''
  )), '');

  v_email := lower(nullif(trim(coalesce(
    p_payload#>>'{customer,email}',
    p_payload->>'customer_email',
    p_payload#>>'{buyer,email}',
    ''
  )), ''));

  v_name := nullif(trim(coalesce(
    p_payload#>>'{customer,full_name}',
    p_payload#>>'{customer,name}',
    p_payload->>'customer_name',
    ''
  )), '');

  v_phone := nullif(trim(coalesce(
    p_payload#>>'{customer,phone}',
    p_payload->>'customer_phone',
    ''
  )), '');

  v_country := nullif(trim(coalesce(
    p_payload#>>'{customer,country}',
    p_payload->>'customer_country',
    ''
  )), '');

  v_product_code := nullif(trim(coalesce(
    p_payload#>>'{product,code}',
    p_payload->>'product_code',
    ''
  )), '');

  v_product_name := nullif(trim(coalesce(
    p_payload#>>'{product,name}',
    p_payload->>'product_name',
    ''
  )), '');

  v_plan_code := nullif(trim(coalesce(
    p_payload#>>'{plan,code}',
    p_payload->>'plan_code',
    ''
  )), '');

  v_plan_name := nullif(trim(coalesce(
    p_payload#>>'{plan,name}',
    p_payload->>'plan_name',
    ''
  )), '');

  v_amount := public.perfectpay_safe_numeric(coalesce(
    p_payload->>'sale_amount',
    p_payload#>>'{sale,amount}',
    p_payload->>'amount',
    ''
  ));

  v_currency := nullif(trim(coalesce(
    p_payload->>'currency_enum',
    p_payload->>'currency',
    p_payload#>>'{sale,currency}',
    'BRL'
  )), '');

  v_payment_type := public.perfectpay_safe_integer(coalesce(
    p_payload->>'payment_type_enum',
    p_payload#>>'{sale,payment_type_enum}',
    ''
  ));

  v_payment_method := public.perfectpay_safe_integer(coalesce(
    p_payload->>'payment_method_enum',
    p_payload#>>'{sale,payment_method_enum}',
    ''
  ));

  v_coupon := nullif(trim(coalesce(
    p_payload->>'coupon_code',
    p_payload#>>'{sale,coupon_code}',
    ''
  )), '');

  v_status_name := case v_status
    when 1 then 'PENDING'
    when 2 then 'APPROVED'
    when 3 then 'IN_PROCESS'
    when 4 then 'IN_MEDIATION'
    when 5 then 'REJECTED'
    when 6 then 'CANCELED'
    when 7 then 'REFUNDED'
    when 8 then 'AUTHORIZED'
    when 9 then 'CHARGED_BACK'
    when 10 then 'COMPLETED'
    when 11 then 'CHECKOUT_ERROR'
    when 12 then 'PRECHECKOUT'
    when 13 then 'EXPIRED'
    when 16 then 'IN_REVIEW'
    else 'UNMAPPED'
  end;

  v_flow := case
    when v_status = 12 then 'ABANDONED'
    when v_status in (1, 3) then 'WAITING_PAYMENT'
    when v_status in (5, 6, 11) then 'CANCELED'
    when v_status = 13 then 'EXPIRED'
    else null
  end;

  v_recoverable := v_flow is not null and v_email is not null;
  v_approved := v_status in (2, 8, 10);
  v_terminal := v_status in (2, 4, 7, 8, 9, 10, 16);

  if v_sale_code is null and v_email is null then
    raise exception 'sale code and customer email are both missing';
  end if;

  v_identity_key := case
    when v_sale_code is not null then 'sale:' || v_sale_code
    else 'lead:' || coalesce(v_email, '') || ':' || coalesce(v_product_code, '') || ':' || coalesce(v_plan_code, '')
  end;

  v_event_source_time := coalesce(
    p_payload->>'date_updated',
    p_payload->>'date_created',
    p_payload->>'date_approved',
    p_payload#>>'{sale,date_updated}',
    p_payload#>>'{sale,date_created}',
    ''
  );

  v_event_key := 'pp:' || md5(
    v_identity_key || ':' || v_status::text || ':' || v_event_source_time
  );

  v_sanitized := p_payload - 'token' - 'webhook_token' - 'authorization';

  insert into public.perfectpay_events (
    event_key, sale_code, sale_status_enum, sale_status, sale_status_detail,
    customer_email, customer_name, product_code, product_name, plan_code, plan_name,
    payment_type, payment_method, sale_amount, currency, coupon_code,
    event_at, payload_sanitized
  )
  values (
    v_event_key, v_sale_code, v_status, v_status_name,
    nullif(trim(coalesce(p_payload->>'sale_status_detail', p_payload#>>'{sale,status_detail}', '')), ''),
    v_email, v_name, v_product_code, v_product_name, v_plan_code, v_plan_name,
    v_payment_type, v_payment_method, v_amount, v_currency, v_coupon,
    p_received_at, v_sanitized
  )
  on conflict (event_key) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'event_key', v_event_key
    );
  end if;

  select *
  into v_journey
  from public.perfectpay_journeys
  where identity_key = v_identity_key
  for update;

  if not found then
    if v_email is null then
      update public.perfectpay_events
      set processed = true,
          processed_at = now(),
          processing_error = 'Event stored without journey: customer email missing'
      where id = v_event_id;

      return jsonb_build_object(
        'ok', true,
        'duplicate', false,
        'event_key', v_event_key,
        'journey_created', false,
        'reason', 'customer_email_missing'
      );
    end if;

    insert into public.perfectpay_journeys (
      identity_key, sale_code, customer_email, customer_name, customer_phone,
      customer_country, product_code, product_name, plan_code, plan_name,
      current_status_enum, current_status, recovery_flow, recovery_allowed,
      shadow_mode, last_step_sent, next_step_at, last_event_key, last_event_at,
      sale_amount, currency, approved_at, stopped_at
    )
    values (
      v_identity_key, v_sale_code, v_email, v_name, v_phone,
      v_country, v_product_code, v_product_name, v_plan_code, v_plan_name,
      v_status, v_status_name, v_flow, v_recoverable,
      true, 0, case when v_recoverable then p_received_at else null end,
      v_event_key, p_received_at, v_amount, v_currency,
      case when v_approved then p_received_at else null end,
      case when v_terminal then p_received_at else null end
    )
    returning * into v_journey;
  else
    if v_journey.current_status_enum in (2, 7, 8, 9, 10)
       and not v_terminal then
      null;
    else
      update public.perfectpay_journeys
      set sale_code = coalesce(v_sale_code, sale_code),
          customer_email = coalesce(v_email, customer_email),
          customer_name = coalesce(v_name, customer_name),
          customer_phone = coalesce(v_phone, customer_phone),
          customer_country = coalesce(v_country, customer_country),
          product_code = coalesce(v_product_code, product_code),
          product_name = coalesce(v_product_name, product_name),
          plan_code = coalesce(v_plan_code, plan_code),
          plan_name = coalesce(v_plan_name, plan_name),
          current_status_enum = v_status,
          current_status = v_status_name,
          recovery_flow = case when v_terminal then null else v_flow end,
          recovery_allowed = case when v_terminal then false else v_recoverable end,
          shadow_mode = (select mode = 'shadow' from public.perfectpay_settings where id = true),
          next_step_at = case
            when v_terminal then null
            when v_recoverable and next_step_at is null and last_step_sent < 3 then p_received_at
            else next_step_at
          end,
          last_event_key = v_event_key,
          last_event_at = p_received_at,
          sale_amount = coalesce(v_amount, sale_amount),
          currency = coalesce(v_currency, currency),
          recovered = case
            when v_approved and last_step_sent > 0 then true
            else recovered
          end,
          recovered_step = case
            when v_approved and last_step_sent > 0 then last_step_sent
            else recovered_step
          end,
          recovered_revenue = case
            when v_approved and last_step_sent > 0 then coalesce(v_amount, recovered_revenue)
            else recovered_revenue
          end,
          approved_at = case when v_approved then p_received_at else approved_at end,
          stopped_at = case when v_terminal then p_received_at else stopped_at end,
          updated_at = now()
      where id = v_journey.id
      returning * into v_journey;
    end if;
  end if;

  if v_approved and v_journey.last_step_sent > 0 then
    select l.id
    into v_log_id
    from public.perfectpay_email_logs l
    where l.journey_id = v_journey.id
      and l.step = v_journey.last_step_sent
    order by l.created_at desc
    limit 1;

    insert into public.perfectpay_conversions (
      email_log_id, journey_id, recovery_flow, step, sale_code,
      revenue, currency, clicked_at, converted_at
    )
    select
      v_log_id,
      v_journey.id,
      coalesce(l.recovery_flow, 'ABANDONED'),
      v_journey.last_step_sent,
      coalesce(v_sale_code, v_journey.sale_code),
      coalesce(v_amount, v_journey.sale_amount),
      coalesce(v_currency, v_journey.currency),
      l.last_clicked_at,
      p_received_at
    from public.perfectpay_email_logs l
    where l.id = v_log_id
      and coalesce(v_sale_code, v_journey.sale_code) is not null
    on conflict (sale_code) do nothing;

    update public.perfectpay_email_logs
    set converted_at = p_received_at,
        updated_at = now()
    where id = v_log_id;
  end if;

  update public.perfectpay_events
  set processed = true,
      processed_at = now()
  where id = v_event_id;

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'event_key', v_event_key,
    'journey_id', v_journey.id,
    'status', v_status_name,
    'recovery_flow', v_flow,
    'recovery_allowed', v_journey.recovery_allowed,
    'mode', case when v_journey.shadow_mode then 'shadow' else 'live' end
  );
exception
  when others then
    if v_event_id is not null then
      update public.perfectpay_events
      set processing_error = sqlerrm
      where id = v_event_id;
    end if;
    raise;
end
$function$


CREATE OR REPLACE FUNCTION public.perfectpay_mark_delivery_failed(p_delivery_log_id bigint, p_error_message text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_row public.perfectpay_delivery_logs%rowtype;
begin
  select * into v_row
  from public.perfectpay_delivery_logs
  where id = p_delivery_log_id
  for update;

  if not found then
    raise exception 'delivery log not found';
  end if;

  if v_row.status = 'SENT' then
    return jsonb_build_object('ok', true, 'ignored', true, 'reason', 'already_sent');
  end if;

  update public.perfectpay_delivery_logs
  set status = 'FAILED',
      next_retry_at = case
        when attempt_count < 3 then now() + interval '15 minutes'
        else null
      end,
      error_message = left(coalesce(nullif(trim(p_error_message), ''), 'Falha no envio da entrega'), 1000),
      updated_at = now()
  where id = p_delivery_log_id;

  return jsonb_build_object(
    'ok', true,
    'ignored', false,
    'delivery_log_id', p_delivery_log_id,
    'will_retry', v_row.attempt_count < 3
  );
end
$function$


CREATE OR REPLACE FUNCTION public.perfectpay_mark_delivery_sent(p_delivery_log_id bigint, p_gmail_message_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_row public.perfectpay_delivery_logs%rowtype;
begin
  select * into v_row
  from public.perfectpay_delivery_logs
  where id = p_delivery_log_id
  for update;

  if not found then
    raise exception 'delivery log not found';
  end if;

  if v_row.status = 'SENT' then
    return jsonb_build_object('ok', true, 'already_sent', true, 'delivery_log_id', v_row.id);
  end if;

  if v_row.status <> 'CLAIMED' then
    raise exception 'delivery log is not claimed';
  end if;

  update public.perfectpay_delivery_logs
  set status = 'SENT',
      gmail_message_id = nullif(trim(p_gmail_message_id), ''),
      sent_at = now(),
      next_retry_at = null,
      error_message = null,
      updated_at = now()
  where id = p_delivery_log_id;

  return jsonb_build_object('ok', true, 'already_sent', false, 'delivery_log_id', p_delivery_log_id);
end
$function$


CREATE OR REPLACE FUNCTION public.perfectpay_prepare_email_log_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.status is distinct from old.status then
    if new.status = 'SENT' then
      new.sent_at := coalesce(new.sent_at, now());
      new.next_retry_at := null;
      new.error_message := null;
    elsif new.status = 'FAILED' then
      new.next_retry_at := case
        when new.attempt_count < 3 then now() + interval '15 minutes'
        else null
      end;
    elsif new.status = 'SKIPPED' then
      new.next_retry_at := null;
    end if;
  end if;
  new.updated_at := now();
  return new;
end
$function$


CREATE OR REPLACE FUNCTION public.perfectpay_record_click(p_tracking_token uuid, p_user_agent text DEFAULT NULL::text, p_ip_hash text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_log public.perfectpay_email_logs%rowtype;
begin
  select *
  into v_log
  from public.perfectpay_email_logs
  where tracking_token = p_tracking_token
  for update;

  if not found then
    return null;
  end if;

  insert into public.perfectpay_email_clicks (email_log_id, user_agent, ip_hash)
  values (v_log.id, p_user_agent, p_ip_hash);

  update public.perfectpay_email_logs
  set click_count = click_count + 1,
      first_clicked_at = coalesce(first_clicked_at, now()),
      last_clicked_at = now(),
      updated_at = now()
  where id = v_log.id;

  return v_log.checkout_url;
end
$function$


CREATE OR REPLACE FUNCTION public.perfectpay_safe_integer(p_value text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    when p_value ~ '^-?[0-9]+$' then p_value::integer
    else null
  end
$function$


CREATE OR REPLACE FUNCTION public.perfectpay_safe_numeric(p_value text)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    when replace(p_value, ',', '.') ~ '^-?[0-9]+([.][0-9]+)?$'
      then replace(p_value, ',', '.')::numeric
    else null
  end
$function$


CREATE OR REPLACE FUNCTION public.perfectpay_status_name(p_status integer)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case p_status
    when 1 then 'PENDING'
    when 2 then 'APPROVED'
    when 3 then 'IN_PROCESS'
    when 4 then 'IN_MEDIATION'
    when 5 then 'REJECTED'
    when 6 then 'CANCELED'
    when 7 then 'REFUNDED'
    when 8 then 'AUTHORIZED'
    when 9 then 'CHARGED_BACK'
    when 10 then 'COMPLETED'
    when 11 then 'CHECKOUT_ERROR'
    when 12 then 'PRECHECKOUT'
    when 13 then 'EXPIRED'
    when 16 then 'IN_REVIEW'
    else 'UNMAPPED'
  end
$function$


CREATE OR REPLACE FUNCTION public.record_recovery_hard_bounce(p_email text, p_source text DEFAULT 'gmail_dsn'::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_email text := lower(trim(coalesce(p_email,'')));
begin
  if v_email = '' then
    return;
  end if;

  insert into public.email_suppressions
    (email, normalized_email, platform, reason, source, active, metadata, suppressed_at, created_at, updated_at)
  values
    (p_email, v_email, 'global', 'hard_bounce', p_source, true, coalesce(p_metadata,'{}'::jsonb), now(), now(), now())
  on conflict (normalized_email, platform)
  do update set
    email = excluded.email,
    reason = 'hard_bounce',
    source = excluded.source,
    active = true,
    metadata = excluded.metadata,
    suppressed_at = now(),
    updated_at = now();

  update public.purchase_journeys
     set recovery_allowed = false,
         next_step_at = null,
         updated_at = now()
   where lower(trim(buyer_email)) = v_email
     and recovery_allowed = true;

  update public.perfectpay_journeys
     set recovery_allowed = false,
         next_step_at = null,
         updated_at = now()
   where lower(trim(customer_email)) = v_email
     and recovery_allowed = true;
end;
$function$


CREATE OR REPLACE FUNCTION public.rollup_recovery_email_click()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  update public.recovery_email_logs
  set
    click_count = coalesce(click_count, 0) + 1,
    first_clicked_at = coalesce(first_clicked_at, new.clicked_at),
    last_clicked_at = case
      when last_clicked_at is null or new.clicked_at > last_clicked_at then new.clicked_at
      else last_clicked_at
    end
  where id = new.email_log_id;

  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.sync_copy_experiment_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if new.copy_experiment_id is not null then
  update public.copy_experiment_assignments set email_log_id=new.id,sent_at=case when upper(coalesce(new.status,''))='SENT' then coalesce(new.sent_at,now()) else sent_at end
  where platform='hotmart' and experiment_id=new.copy_experiment_id and journey_id=new.journey_id and step=new.step;
 end if;
 return new;
end $function$


CREATE OR REPLACE FUNCTION public.sync_perfectpay_copy_experiment_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if new.copy_experiment_id is not null then
  update public.copy_experiment_assignments set perfectpay_email_log_id=new.id,sent_at=case when upper(coalesce(new.status,''))='SENT' then coalesce(new.sent_at,now()) else sent_at end
  where platform='perfectpay' and experiment_id=new.copy_experiment_id and journey_id=new.journey_id and step=new.step;
 end if;
 return new;
end $function$


-- PostgreSQL grants EXECUTE to PUBLIC by default. Remove that implicit access.
revoke execute on function public."apply_copy_screening_evaluation"() from public;
revoke execute on function public."apply_email_suppression_to_journeys"() from public;
revoke execute on function public."assign_default_copy_variant"() from public;
revoke execute on function public."assign_perfectpay_copy_variant"() from public;
revoke execute on function public."attribute_recovery_conversion"() from public;
revoke execute on function public."carry_forward_recovery_progress"() from public;
revoke execute on function public."claim_email_unsubscribe"(p_token uuid) from public;
revoke execute on function public."copy_laboratory_action"(p_experiment_id uuid, p_action text, p_actor uuid) from public;
revoke execute on function public."copy_laboratory_save_asset"(p_asset_type text, p_title text, p_content text, p_source_url text) from public;
revoke execute on function public."copy_laboratory_track_evaluated_at"() from public;
revoke execute on function public."copy_laboratory_track_generated_at"() from public;
revoke execute on function public."copy_review_variant"(p_variant_id uuid, p_action text, p_actor uuid, p_subject text, p_preheader text, p_body text, p_button_text text, p_footer text, p_hypothesis text) from public;
revoke execute on function public."copy_select_variant"(p_platform text, p_recovery_flow text, p_step integer, p_journey_id bigint) from public;
revoke execute on function public."copy_select_variant"(p_recovery_flow text, p_step integer, p_journey_id bigint) from public;
revoke execute on function public."copy_tournament_prepare_next"(p_platform text, p_recovery_flow text, p_step integer, p_actor uuid) from public;
revoke execute on function public."deactivate_older_active_recovery_journeys"() from public;
revoke execute on function public."enforce_email_suppression_on_hotmart_journey"() from public;
revoke execute on function public."enforce_email_suppression_on_perfectpay_journey"() from public;
revoke execute on function public."hotmart_claim_delivery"(p_transaction_id text, p_journey_id bigint, p_customer_email text, p_customer_name text, p_product_id text, p_product_name text) from public;
revoke execute on function public."hotmart_claim_due_deliveries"(p_limit integer) from public;
revoke execute on function public."hotmart_mark_delivery_failed"(p_delivery_log_id bigint, p_error_message text) from public;
revoke execute on function public."hotmart_mark_delivery_pdfs_sent"(p_delivery_log_id bigint, p_gmail_message_id text) from public;
revoke execute on function public."hotmart_mark_delivery_sent"(p_delivery_log_id bigint, p_gmail_message_id text) from public;
revoke execute on function public."is_email_suppressed"(p_email text, p_platform text) from public;
revoke execute on function public."issue_email_unsubscribe_token"(p_email text, p_platform text, p_source_table text, p_source_email_log_id bigint) from public;
revoke execute on function public."perfectpay_apply_email_log_status"() from public;
revoke execute on function public."perfectpay_claim_delivery"(p_sale_code text, p_customer_email text, p_customer_name text, p_product_code text, p_product_name text) from public;
revoke execute on function public."perfectpay_claim_due_deliveries"(p_limit integer) from public;
revoke execute on function public."perfectpay_claim_due_recoveries"(p_limit integer) from public;
revoke execute on function public."perfectpay_get_selected_copy"(p_email_log_id bigint) from public;
revoke execute on function public."perfectpay_ingest_event"(p_payload jsonb, p_received_at timestamp with time zone) from public;
revoke execute on function public."perfectpay_ingest_event_core"(p_payload jsonb, p_received_at timestamp with time zone) from public;
revoke execute on function public."perfectpay_mark_delivery_failed"(p_delivery_log_id bigint, p_error_message text) from public;
revoke execute on function public."perfectpay_mark_delivery_sent"(p_delivery_log_id bigint, p_gmail_message_id text) from public;
revoke execute on function public."perfectpay_prepare_email_log_status"() from public;
revoke execute on function public."perfectpay_record_click"(p_tracking_token uuid, p_user_agent text, p_ip_hash text) from public;
revoke execute on function public."perfectpay_safe_integer"(p_value text) from public;
revoke execute on function public."perfectpay_safe_numeric"(p_value text) from public;
revoke execute on function public."perfectpay_status_name"(p_status integer) from public;
revoke execute on function public."record_recovery_hard_bounce"(p_email text, p_source text, p_metadata jsonb) from public;
revoke execute on function public."rollup_recovery_email_click"() from public;
revoke execute on function public."sync_copy_experiment_assignment"() from public;
revoke execute on function public."sync_perfectpay_copy_experiment_assignment"() from public;
