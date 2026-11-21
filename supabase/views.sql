-- Portfolio-safe views. Run after schema-public.sql.

create or replace view public."copy_experiment_email_metrics_source" with (security_invoker = true) as
 SELECT 'hotmart'::text AS platform,
    l.id AS email_log_id,
    l.copy_experiment_id,
    l.copy_variant_id,
    l.status,
    l.click_count,
    l.sent_at,
    l.converted_at,
    COALESCE(l.converted_revenue, (0)::numeric) AS converted_revenue
   FROM recovery_email_logs l
  WHERE (l.copy_experiment_id IS NOT NULL)
UNION ALL
 SELECT 'perfectpay'::text AS platform,
    l.id AS email_log_id,
    l.copy_experiment_id,
    l.copy_variant_id,
    l.status,
    l.click_count,
    l.sent_at,
    l.converted_at,
    COALESCE(c.revenue, (0)::numeric) AS converted_revenue
   FROM (perfectpay_email_logs l
     LEFT JOIN ( SELECT perfectpay_conversions.email_log_id,
            sum(COALESCE(perfectpay_conversions.revenue, (0)::numeric)) AS revenue
           FROM perfectpay_conversions
          WHERE (perfectpay_conversions.email_log_id IS NOT NULL)
          GROUP BY perfectpay_conversions.email_log_id) c ON ((c.email_log_id = l.id)))
  WHERE (l.copy_experiment_id IS NOT NULL);
