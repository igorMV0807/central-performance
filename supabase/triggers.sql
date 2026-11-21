-- Application triggers. Run after functions.sql.

CREATE TRIGGER copy_evaluations_track_evaluated_at AFTER INSERT ON copy_evaluations FOR EACH ROW EXECUTE FUNCTION copy_laboratory_track_evaluated_at();
CREATE TRIGGER trg_apply_copy_screening_evaluation AFTER INSERT ON copy_evaluations FOR EACH ROW EXECUTE FUNCTION apply_copy_screening_evaluation();
CREATE TRIGGER copy_variants_track_generated_at AFTER INSERT ON copy_variants FOR EACH ROW EXECUTE FUNCTION copy_laboratory_track_generated_at();
CREATE TRIGGER trg_apply_email_suppression AFTER INSERT OR UPDATE OF active, normalized_email ON email_suppressions FOR EACH ROW EXECUTE FUNCTION apply_email_suppression_to_journeys();
CREATE TRIGGER perfectpay_email_log_status_apply AFTER UPDATE OF status ON perfectpay_email_logs FOR EACH ROW EXECUTE FUNCTION perfectpay_apply_email_log_status();
CREATE TRIGGER perfectpay_email_log_status_prepare BEFORE UPDATE OF status ON perfectpay_email_logs FOR EACH ROW EXECUTE FUNCTION perfectpay_prepare_email_log_status();
CREATE TRIGGER perfectpay_email_logs_assign_copy_variant BEFORE INSERT ON perfectpay_email_logs FOR EACH ROW EXECUTE FUNCTION assign_perfectpay_copy_variant();
CREATE TRIGGER perfectpay_email_logs_sync_copy_assignment AFTER INSERT OR UPDATE ON perfectpay_email_logs FOR EACH ROW EXECUTE FUNCTION sync_perfectpay_copy_experiment_assignment();
CREATE TRIGGER trg_enforce_email_suppression_perfectpay BEFORE INSERT OR UPDATE OF customer_email, recovery_allowed ON perfectpay_journeys FOR EACH ROW EXECUTE FUNCTION enforce_email_suppression_on_perfectpay_journey();
CREATE TRIGGER purchase_journeys_attribute_recovery AFTER INSERT OR UPDATE ON purchase_journeys FOR EACH ROW EXECUTE FUNCTION attribute_recovery_conversion();
CREATE TRIGGER trg_carry_forward_recovery_progress BEFORE INSERT OR UPDATE OF recovery_allowed, buyer_email, product_id, offer_code, last_step_sent ON purchase_journeys FOR EACH ROW EXECUTE FUNCTION carry_forward_recovery_progress();
CREATE TRIGGER trg_deactivate_older_active_recovery_journeys AFTER INSERT OR UPDATE OF recovery_allowed, buyer_email, product_id, offer_code ON purchase_journeys FOR EACH ROW WHEN (new.recovery_allowed = true) EXECUTE FUNCTION deactivate_older_active_recovery_journeys();
CREATE TRIGGER trg_enforce_email_suppression_hotmart BEFORE INSERT OR UPDATE OF buyer_email, recovery_allowed ON purchase_journeys FOR EACH ROW EXECUTE FUNCTION enforce_email_suppression_on_hotmart_journey();
CREATE TRIGGER recovery_email_clicks_rollup AFTER INSERT ON recovery_email_clicks FOR EACH ROW EXECUTE FUNCTION rollup_recovery_email_click();
CREATE TRIGGER recovery_email_logs_assign_copy_variant BEFORE INSERT ON recovery_email_logs FOR EACH ROW EXECUTE FUNCTION assign_default_copy_variant();
CREATE TRIGGER recovery_email_logs_sync_copy_assignment AFTER INSERT OR UPDATE OF status, sent_at, copy_experiment_id, copy_variant_id ON recovery_email_logs FOR EACH ROW EXECUTE FUNCTION sync_copy_experiment_assignment();
