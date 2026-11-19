import {
  AlertCircle,
  Beaker,
  Bot,
  CheckCircle2,
  Clock3,
  FileText,
  ListChecks,
  Mail,
  MousePointerClick,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Trophy,
  Video,
  WalletCards,
  XCircle,
} from "lucide-react";
import { AutoRefresh } from "@/components/auto-refresh";
import { flowLabel } from "@/components/flow-filter";
import { PageHeader } from "@/components/page-header";
import { formatDateTime, formatMoney, formatPercent } from "@/lib/format";
import { getCopyLaboratory, type CopyLiveMetrics, type CopyVariant } from "@/lib/copy-lab";
import { runExperimentAction, runVariantReviewAction, saveLaboratoryAsset } from "./actions";

export const dynamic = "force-dynamic";

type LaboratoryExperiment = Awaited<ReturnType<typeof getCopyLaboratory>>["experiments"][number];

export default async function CopyLaboratoryPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const [data, params] = await Promise.all([getCopyLaboratory(), searchParams]);
  const runningExperiments = data.experiments.filter((experiment) => experiment.status === "running");
  const runningPerfectPayExperiments = runningExperiments.filter((experiment) => experiment.platform === "perfectpay");
  const activeExperiments = orderExperiments(data.experiments.filter((experiment) => ["running", "paused", "ready", "manual_review", "shadow"].includes(experiment.status)));
  const closedExperiments = orderExperiments(data.experiments.filter((experiment) => ["completed", "cancelled"].includes(experiment.status)));
  const orderedPerfectPayExperiments = orderExperiments(runningPerfectPayExperiments);
  const roundTotals = runningPerfectPayExperiments.reduce((total, experiment) => {
    total.sent += experiment.championLiveMetrics.sent + experiment.challengerLiveMetrics.sent;
    total.clicked += experiment.championLiveMetrics.clicked + experiment.challengerLiveMetrics.clicked;
    total.purchases += experiment.championLiveMetrics.purchases + experiment.challengerLiveMetrics.purchases;
    total.revenue += experiment.championLiveMetrics.revenue + experiment.challengerLiveMetrics.revenue;
    if (experiment.championLiveMetrics.sent + experiment.challengerLiveMetrics.sent > 0) total.testsWithData += 1;
    return total;
  }, { sent: 0, clicked: 0, purchases: 0, revenue: 0, testsWithData: 0 });
  const roundClickRate = roundTotals.sent ? (roundTotals.clicked / roundTotals.sent) * 100 : 0;
  const roundConversionRate = roundTotals.sent ? (roundTotals.purchases / roundTotals.sent) * 100 : 0;
  const activeVideo = data.activeAssets.find((asset) => asset.asset_type === "video_transcript") || null;
  const pendingDrafts = data.draftsForReview;
  const expectedChampions = 30;
  const setupDone = [data.hasOfferRules, data.hasBrandRules, data.hasActiveVideo, data.champions.length === expectedChampions];
  const setupPercent = Math.round((setupDone.filter(Boolean).length / setupDone.length) * 100);

  return (
    <>
      <PageHeader
        eyebrow="Laboratório de copys"
        title="Criação, revisão e teste de copys"
        description="Na PerfectPay, a IA prepara rascunhos com liberdade criativa, você revisa tudo e somente uma aprovação manual abre o teste 50/50. Nenhum dado pessoal é enviado à IA."
      >
        <AutoRefresh />
      </PageHeader>

      {params.notice && <Notice tone="success" text={params.notice} />}
      {params.error && <Notice tone="error" text={params.error} />}

      <section className="mb-5 flex flex-col gap-4 rounded-2xl border border-violet-200 bg-violet-50 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-violet-600 text-white">
            <ShieldCheck size={22} />
          </div>
          <div>
            <p className="font-semibold text-slate-950">Triagem com limite e controle humano</p>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
              Cada teste da PerfectPay recebe no máximo 10 envios em A e 10 em B. A promoção automática continua desligada e a Hotmart não foi alterada.
            </p>
          </div>
        </div>
        <span className="w-fit rounded-full bg-violet-600 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white">
          {modeLabel(data.settings?.mode)}
        </span>
      </section>

      {!data.settings?.automatic_generation && (
        <section className="mb-5 flex flex-col gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-500 text-white">
              <Bot size={22} />
            </div>
            <div>
              <p className="font-semibold text-amber-950">Gemini aguardando conexão no n8n</p>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-amber-800">
                A criação automática está pausada para não gerar novas copys com o modelo antigo. Os testes em andamento continuam normalmente e os rascunhos abaixo podem ser revisados sem risco.
              </p>
            </div>
          </div>
          <span className="w-fit rounded-full bg-amber-500 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white">Geração pausada</span>
        </section>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <LabMetricCard icon={<Beaker size={22} />} label="Testes ativos" value={String(runningPerfectPayExperiments.length)} detail={roundTotals.testsWithData + " já receberam envios"} tone="violet" />
        <LabMetricCard icon={<Mail size={22} />} label="E-mails da rodada" value={String(roundTotals.sent)} detail="Versão A + versão B" tone="blue" />
        <LabMetricCard icon={<MousePointerClick size={22} />} label="Cliques" value={String(roundTotals.clicked)} detail={"CTR " + formatPercent(roundClickRate)} tone="amber" />
        <LabMetricCard icon={<ShoppingCart size={22} />} label="Compras" value={String(roundTotals.purchases)} detail={"Conversão " + formatPercent(roundConversionRate)} tone="emerald" />
        <LabMetricCard icon={<WalletCards size={22} />} label="Receita atribuída" value={formatMoney(roundTotals.revenue)} detail="Somente a rodada atual" tone="rose" />
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 p-5">
          <div>
            <p className="section-kicker">Placar da rodada atual</p>
            <h2 className="text-xl font-semibold">Veja rapidamente quem está na frente</h2>
            <p className="mt-1 text-sm text-slate-500">Somente os testes ativos da PerfectPay. O histórico encerrado fica separado no fim da página.</p>
          </div>
          <a href="#testes-ativos" className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">Ver copys completas</a>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full text-left">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Jornada / e-mail</th>
                <th className="px-5 py-3">Versão A</th>
                <th className="px-5 py-3">Versão B</th>
                <th className="px-5 py-3">Sinal atual</th>
                <th className="px-5 py-3">Amostra</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orderedPerfectPayExperiments.map((experiment) => (
                <tr key={"score-" + experiment.id} className="align-top hover:bg-slate-50/70">
                  <td className="px-5 py-4">
                    <p className="font-semibold text-slate-900">{flowLabel(experiment.recovery_flow)}</p>
                    <p className="mt-1 text-xs text-slate-500">E-mail {experiment.step} · {experiment.traffic_challenger_percent}% para B</p>
                  </td>
                  <td className="px-5 py-4"><CompactMetrics metrics={experiment.championLiveMetrics} /></td>
                  <td className="px-5 py-4"><CompactMetrics metrics={experiment.challengerLiveMetrics} accent /></td>
                  <td className="px-5 py-4"><RoundSignal experiment={experiment} /></td>
                  <td className="px-5 py-4"><SampleProgress experiment={experiment} compact /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[.8fr_1.2fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="section-kicker">Preparação</p>
              <h2 className="text-lg font-semibold">Base de conhecimento</h2>
            </div>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">{setupPercent}%</span>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-blue-600" style={{ width: `${setupPercent}%` }} />
          </div>
          <div className="mt-4 space-y-3">
            <SetupItem done={data.hasOfferRules} label="Regras da oferta" detail="Preços, cupons e jornadas permitidas" />
            <SetupItem done={data.hasBrandRules} label="Regras de linguagem preservadas" detail="Disponíveis para sua revisão, sem limitar o novo rascunho" />
            <SetupItem done={data.hasActiveVideo} label="Vídeo ou transcrição" detail="Argumentos e ganchos da oferta" />
            <SetupItem done={data.champions.length === expectedChampions} label="Copys atuais" detail={`${data.champions.length} de ${expectedChampions} copys de controle preservadas entre Hotmart e PerfectPay`} />
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <p className="section-kicker">Adicionar material</p>
          <h2 className="text-lg font-semibold">Ensine o laboratório</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Cole a transcrição do vídeo, regras ou copys antigas. Ao salvar uma nova versão do mesmo tipo, a anterior fica preservada no histórico e deixa de ser usada.
          </p>
          <form action={saveLaboratoryAsset} className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              Tipo
              <select name="asset_type" required className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500">
                <option value="video_transcript">Transcrição do vídeo</option>
                <option value="offer_rules">Regras da oferta</option>
                <option value="brand_rules">Regras de linguagem</option>
                <option value="legacy_copy">Copy antiga</option>
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Título
              <input name="title" required minLength={3} placeholder="Ex.: Vídeo principal — outubro" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500" />
            </label>
            <label className="text-sm font-medium text-slate-700 sm:col-span-2">
              Link de origem (opcional)
              <input name="source_url" type="url" placeholder="https://..." className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500" />
            </label>
            <label className="text-sm font-medium text-slate-700 sm:col-span-2">
              Conteúdo
              <textarea name="content" required minLength={20} rows={7} placeholder="Cole aqui a transcrição, regra ou copy..." className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 px-3 py-2.5 text-sm leading-6 outline-none focus:border-blue-500" />
            </label>
            <div className="sm:col-span-2">
              <button className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700">
                <FileText size={17} /> Salvar material
              </button>
            </div>
          </form>
        </article>
      </section>

      {activeVideo && (
        <section id="vsl-principal" className="mt-6 scroll-mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
          <div className="border-b border-slate-200 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="section-kicker">VSL principal</p>
                <h2 className="text-lg font-semibold">Vídeo e transcrição no mesmo lugar</h2>
                <p className="mt-1 text-sm text-slate-500">Assista à oferta e confira o texto que o laboratório usa para criar novas copys.</p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                <CheckCircle2 size={15} /> Transcrição ativa
              </span>
            </div>
          </div>
          <div className="grid gap-5 p-5 xl:grid-cols-[minmax(0,.85fr)_minmax(0,1.15fr)]">
            <div>
              <div className="overflow-hidden rounded-2xl bg-slate-950 shadow-lg">
                <video
                  controls
                  preload="metadata"
                  poster="/media/vsl-principal-capa.svg"
                  src={activeVideo.source_url || "/media/vsl-principal.mp4"}
                  className="aspect-[289/360] max-h-[620px] w-full bg-black object-contain"
                >
                  Seu navegador não conseguiu reproduzir este vídeo.
                </video>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <span>56 min · arquivo local protegido</span>
                <a href="/media/vsl-principal-transcricao.txt" download className="font-semibold text-blue-700 hover:text-blue-800">
                  Baixar transcrição
                </a>
              </div>
            </div>

            <article className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-100 text-blue-700"><FileText size={20} /></span>
                <div>
                  <p className="font-semibold text-slate-900">{activeVideo.title}</p>
                  <p className="mt-1 text-xs text-slate-500">Atualizada em {formatDateTime(activeVideo.updated_at)}</p>
                </div>
              </div>
              <div className="mt-4 max-h-[560px] overflow-y-auto rounded-xl border border-slate-200 bg-white p-4">
                <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{previewText(activeVideo.content, 5000)}</p>
              </div>
              {activeVideo.content.length > 5000 && <p className="mt-3 text-xs leading-5 text-slate-500">Mostrando uma prévia para manter a página rápida. A transcrição completa continua disponível no botão de download.</p>}
            </article>
          </div>
        </section>
      )}

      {!data.hasActiveVideo && (
        <section className="mt-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <AlertCircle className="mt-0.5 shrink-0 text-amber-600" size={21} />
          <div>
            <p className="font-semibold text-amber-950">A transcrição do vídeo ainda não foi cadastrada</p>
            <p className="mt-1 text-sm leading-6 text-amber-800">
              O gerador continua seguro usando as regras oficiais e as copys atuais, mas ficará melhor quando você colar a transcrição acima.
            </p>
          </div>
        </section>
      )}

      <section id="rascunhos" className="mt-6 scroll-mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 p-5">
          <div>
            <p className="section-kicker">Caixa de revisão</p>
            <h2 className="text-xl font-semibold">Rascunhos aguardando sua decisão</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
              Edite qualquer parte da copy. Salvar não inicia teste; somente “Aprovar e iniciar” coloca A e B em uma rodada de 10 envios por versão.
            </p>
          </div>
          <span className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-800">
            {pendingDrafts.length} {pendingDrafts.length === 1 ? "pendente" : "pendentes"}
          </span>
        </div>

        {pendingDrafts.length ? (
          <div className="divide-y divide-slate-100">
            {pendingDrafts.map((variant) => (
              <form key={variant.id} action={runVariantReviewAction} className="p-5 sm:p-6">
                <input type="hidden" name="variant_id" value={variant.id} />
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-slate-950">PerfectPay · {flowLabel(variant.recovery_flow)} · E-mail {variant.step}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Versão {variant.version_number} · criada em {formatDateTime(variant.created_at)} · {generatorLabel(variant.generated_by)}
                    </p>
                  </div>
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">Ainda não publicada</span>
                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  <label className="text-sm font-medium text-slate-700">
                    Assunto
                    <input name="subject" required defaultValue={variant.subject} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500" />
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Preheader
                    <input name="preheader" required defaultValue={variant.preheader} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500" />
                  </label>
                  <label className="text-sm font-medium text-slate-700 lg:col-span-2">
                    Corpo do e-mail
                    <textarea name="body" required rows={14} defaultValue={variant.body} className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 px-3 py-3 text-sm leading-7 outline-none focus:border-blue-500" />
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Texto do botão
                    <input name="button_text" required defaultValue={variant.button_text} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500" />
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Rodapé
                    <input name="footer" defaultValue={variant.footer} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500" />
                  </label>
                  <label className="text-sm font-medium text-slate-700 lg:col-span-2">
                    Hipótese do teste
                    <textarea name="hypothesis" rows={3} defaultValue={variant.hypothesis || ""} className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 px-3 py-3 text-sm leading-6 outline-none focus:border-blue-500" />
                  </label>
                </div>

                <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                  <button name="variant_action" value="save" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                    <FileText size={17} /> Salvar sem iniciar
                  </button>
                  <button name="variant_action" value="approve" className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700">
                    <Play size={17} /> Aprovar e iniciar 50/50
                  </button>
                  <button formNoValidate name="variant_action" value="reject" className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50">
                    <XCircle size={17} /> Rejeitar rascunho
                  </button>
                </div>
              </form>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center">
            <CheckCircle2 className="mx-auto text-emerald-500" size={34} />
            <p className="mt-3 font-semibold text-slate-700">Nenhum rascunho aguardando revisão</p>
            <p className="mx-auto mt-1 max-w-lg text-sm leading-6 text-slate-500">Quando o Gemini estiver conectado, as novas versões aparecerão aqui antes de qualquer teste.</p>
          </div>
        )}
      </section>

      {data.tournamentCandidates.length > 0 && (
        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
          <div className="border-b border-slate-200 p-5">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-100 text-violet-700"><ListChecks size={20} /></span>
              <div>
                <p className="section-kicker">Torneio de copys</p>
                <h2 className="text-lg font-semibold">Caminho rápido para encontrar uma copy comprovada</h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Os 15 e-mails da PerfectPay são testados separadamente, sempre com divisão 50/50 e limite de 20 envios. A lista abaixo guarda alternativas para rodadas futuras.
                </p>
              </div>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {data.tournamentCandidates.map((candidate) => (
              <div key={candidate.id} className="grid gap-3 p-5 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-sm font-bold text-slate-700">{candidate.sequence_number}</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">
                    {platformLabel(candidate.platform)} · {flowLabel(candidate.recovery_flow)} · E-mail {candidate.step}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">{angleLabel(candidate.angle)} · {stageLabel(candidate.stage)}</p>
                  <p className="mt-1 truncate text-xs text-slate-500">{candidate.variant?.subject || "Copy não encontrada"}</p>
                </div>
                <TournamentStatus value={candidate.status} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section id="testes-ativos" className="mt-6 scroll-mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
        <div className="border-b border-slate-200 p-5">
          <p className="section-kicker">Detalhes dos testes ativos</p>
          <h2 className="text-xl font-semibold">Versão A × versão B, com números grandes</h2>
          <p className="mt-1 text-sm text-slate-500">Cada cartão mostra envios, cliques, CTR, compras, conversão e receita. A copy completa continua disponível sem ocupar a tela.</p>
        </div>
        {activeExperiments.length ? (
          <div className="divide-y divide-slate-100">
            {activeExperiments.map((experiment) => {
              const championMetrics = experiment.championLiveMetrics;
              const challengerMetrics = experiment.challengerLiveMetrics;
              const statistical = statisticalObject(experiment.evaluation?.challenger_metrics.statistical);
              return (
                <div id={`test-${experiment.id}`} key={experiment.id} className="scroll-mt-6 p-5 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold">{platformLabel(experiment.platform)} · {flowLabel(experiment.recovery_flow)} · E-mail {experiment.step}</p>
                      <p className="mt-1 text-sm text-slate-500">
                        Criado em {formatDateTime(experiment.created_at)} · {100 - experiment.traffic_challenger_percent}% versão A / {experiment.traffic_challenger_percent}% versão B
                      </p>
                    </div>
                    <Status value={experiment.status} />
                  </div>

                  <div className="mt-5 grid gap-4 xl:grid-cols-2">
                    <VariantBox label="Versão A · emocional" variant={experiment.champion} metrics={championMetrics} minimumSends={experiment.minimum_sends_per_variant} />
                    <VariantBox label="Versão B · emocional dark" variant={experiment.challenger} metrics={challengerMetrics} minimumSends={experiment.minimum_sends_per_variant} accent />
                  </div>

                  <div className="mt-4 grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:grid-cols-[minmax(0,1fr)_280px_auto] lg:items-center">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800">{experiment.evaluation?.reason || experiment.decision_reason || "Aguardando a primeira avaliação."}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {experiment.primary_metric === "click_rate"
                          ? `Triagem: ${experiment.minimum_sends_per_variant} envios por versão, ${experiment.minimum_sends_per_variant * 2} no total. Cliques indicam apenas a versão promissora.`
                          : `Mínimo: ${experiment.minimum_sends_per_variant} envios por versão e ${experiment.minimum_purchases_total} compras no total.`}
                      </p>
                      {statistical && experiment.primary_metric !== "click_rate" && (
                        <p className="mt-1 text-xs font-medium text-violet-700">
                          Confiança de vantagem da desafiante: {formatPercent(metricNumber(statistical, "probability_challenger_better") * 100)} · decisão exige 90% de confiança e ganho mínimo de 5%.
                        </p>
                      )}
                    </div>
                    <SampleProgress experiment={experiment} />
                    <ExperimentControls status={experiment.status} experimentId={experiment.id} decision={experiment.evaluation?.decision || null} primaryMetric={experiment.primary_metric} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-8 text-center">
            <Clock3 className="mx-auto text-slate-300" size={34} />
            <p className="mt-3 font-semibold text-slate-700">Nenhum teste criado ainda</p>
            <p className="mx-auto mt-1 max-w-lg text-sm leading-6 text-slate-500">O gerador criará uma nova versão B segura para revisão, sem colocá-la em produção sozinho.</p>
          </div>
        )}
      </section>

      {closedExperiments.length > 0 && (
        <details className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5">
            <div>
              <p className="section-kicker">Histórico separado</p>
              <h2 className="text-lg font-semibold">Testes encerrados ({closedExperiments.length})</h2>
              <p className="mt-1 text-sm text-slate-500">Abra somente quando quiser consultar rodadas antigas. Elas não entram nos números da rodada atual.</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">Ver histórico</span>
          </summary>
          <div className="overflow-x-auto border-t border-slate-200">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Plataforma</th><th className="px-5 py-3">Jornada</th><th className="px-5 py-3">E-mail</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Iniciado</th><th className="px-5 py-3">Motivo</th></tr></thead>
              <tbody>{closedExperiments.map((experiment) => <tr key={experiment.id} className="border-t border-slate-100"><td className="px-5 py-4">{platformLabel(experiment.platform)}</td><td className="px-5 py-4 font-medium">{flowLabel(experiment.recovery_flow)}</td><td className="px-5 py-4">{experiment.step}</td><td className="px-5 py-4"><Status value={experiment.status} /></td><td className="px-5 py-4 text-slate-500">{formatDateTime(experiment.started_at || experiment.created_at)}</td><td className="max-w-md px-5 py-4 text-xs leading-5 text-slate-500">{experiment.decision_reason || "Sem observação"}</td></tr>)}</tbody>
            </table>
          </div>
        </details>
      )}

      <section className="mt-6 grid gap-6 xl:grid-cols-[.9fr_1.1fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <p className="section-kicker">Agenda econômica</p>
          <h2 className="text-lg font-semibold">O que roda sozinho</h2>
          <div className="mt-4 space-y-3">
            <Schedule icon={<Video size={18} />} title="Analisar material" time="Todos os dias, 07:30" detail="Só chama IA quando a transcrição muda." />
            <Schedule icon={<Sparkles size={18} />} title="Criar nova alternativa" time={data.settings?.automatic_generation ? "A cada 6 horas" : "Pausado até conectar o Gemini"} detail="Cria um rascunho por vez e sempre exige sua revisão antes do teste." />
            <Schedule icon={<Beaker size={18} />} title="Avaliar teste" time="A cada 3 horas" detail="Sem teste ativo, termina sem trabalho caro." />
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
          <p className="section-kicker">Materiais ativos</p>
          <h2 className="text-lg font-semibold">Base disponível no laboratório</h2>
          <div className="mt-4 space-y-3">
            {data.activeAssets.map((asset) => (
              <details key={asset.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <summary className="cursor-pointer list-none text-sm font-semibold text-slate-800">
                  {assetLabel(asset.asset_type)} · {asset.title}
                  <span className="ml-2 text-xs font-normal text-slate-400">{formatDateTime(asset.updated_at)}</span>
                </summary>
                {asset.asset_type === "video_transcript" ? (
                  <p className="mt-3 text-sm leading-6 text-slate-600">A transcrição completa está na seção “VSL principal” e também pode ser baixada em arquivo de texto.</p>
                ) : (
                  <>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{previewText(asset.content, 3500)}</p>
                    {asset.content.length > 3500 && <p className="mt-2 text-xs text-slate-400">Prévia reduzida para manter o laboratório rápido.</p>}
                  </>
                )}
              </details>
            ))}
          </div>
        </article>
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
        <div className="border-b border-slate-200 p-5">
          <p className="section-kicker">Biblioteca</p>
          <h2 className="text-lg font-semibold">Versões de referência preservadas</h2>
          <p className="mt-1 text-sm text-slate-500">O histórico permanece guardado. Na PerfectPay, referência não significa campeã: a confirmação exige uma etapa posterior com mais dados.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-5 py-3">Plataforma</th><th className="px-5 py-3">Jornada</th><th className="px-5 py-3">E-mail</th><th className="px-5 py-3">Assunto</th><th className="px-5 py-3">Oferta</th><th className="px-5 py-3">QA</th></tr>
            </thead>
            <tbody>
              {data.champions.map((variant) => (
                <tr key={variant.id} className="border-t border-slate-100">
                  <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${variant.platform === "perfectpay" ? "bg-violet-50 text-violet-700" : "bg-orange-50 text-orange-700"}`}>{platformLabel(variant.platform)}</span></td>
                  <td className="px-5 py-4 font-medium">{flowLabel(variant.recovery_flow)}</td>
                  <td className="px-5 py-4">{variant.step}</td>
                  <td className="max-w-xl px-5 py-4"><p className="truncate font-medium text-slate-800">{variant.subject}</p><p className="mt-1 truncate text-xs text-slate-500">{variant.preheader || "Sem preheader"}</p></td>
                  <td className="px-5 py-4">{variant.offer_code ? `${variant.offer_code} · ${formatMoney(variant.displayed_price)}` : "Sem desconto"}</td>
                  <td className="px-5 py-4"><span className="inline-flex items-center gap-1.5 text-emerald-700"><CheckCircle2 size={15} /> Aprovada</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="mt-5 text-xs leading-5 text-slate-400">O laboratório não inventa aberturas. Como o Gmail atual não fornece essa métrica, a decisão usa somente envios rastreados, cliques, compras e receita atribuída.</p>
    </>
  );
}

function platformLabel(platform?: string | null) {
  return String(platform || "hotmart").toLowerCase() === "perfectpay" ? "PerfectPay" : "Hotmart";
}

function generatorLabel(value?: string | null) {
  if (String(value || "").startsWith("google_gemini")) return "Criada pelo Gemini";
  if (value === "tournament_curated") return "Alternativa preparada anteriormente";
  return "Criada pelo modelo anterior";
}

function Notice({ tone, text }: { tone: "success" | "error"; text: string }) {
  const good = tone === "success";
  return <div className={`mb-5 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${good ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>{good ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}<span>{text}</span></div>;
}

function LabMetricCard({ icon, label, value, detail, tone }: { icon: React.ReactNode; label: string; value: string; detail: string; tone: "blue" | "violet" | "emerald" | "amber" | "rose" }) {
  const tones = {
    blue: "bg-blue-600 text-blue-600 bg-blue-50",
    violet: "bg-violet-600 text-violet-600 bg-violet-50",
    emerald: "bg-emerald-600 text-emerald-600 bg-emerald-50",
    amber: "bg-amber-500 text-amber-600 bg-amber-50",
    rose: "bg-rose-500 text-rose-600 bg-rose-50",
  };
  const [bar, textTone, iconTone] = tones[tone].split(" ");
  return <article className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-soft"><div className={"absolute inset-x-0 top-0 h-1.5 " + bar} /><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-2 text-4xl font-bold tracking-tight text-slate-950">{value}</p></div><span className={"grid h-11 w-11 shrink-0 place-items-center rounded-xl " + iconTone + " " + textTone}>{icon}</span></div><p className="mt-3 text-sm text-slate-500">{detail}</p></article>;
}

function CompactMetrics({ metrics, accent = false }: { metrics: CopyLiveMetrics; accent?: boolean }) {
  return <div><p className={"text-2xl font-bold " + (accent ? "text-violet-700" : "text-blue-700")}>{metrics.sent} <span className="text-xs font-medium text-slate-400">envios</span></p><p className="mt-1 text-xs text-slate-600"><strong>{metrics.clicked}</strong> cliques · CTR {formatPercent(metrics.click_rate)}</p><p className="mt-1 text-xs text-slate-600"><strong>{metrics.purchases}</strong> compras · {formatMoney(metrics.revenue)}</p></div>;
}

function RoundSignal({ experiment }: { experiment: LaboratoryExperiment }) {
  const a = experiment.championLiveMetrics;
  const b = experiment.challengerLiveMetrics;
  if (a.sent + b.sent === 0) return <span className="inline-flex rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">Aguardando envios</span>;
  if (experiment.primary_metric === "click_rate") {
    const complete = a.sent >= experiment.minimum_sends_per_variant && b.sent >= experiment.minimum_sends_per_variant;
    if (complete && a.clicked === 0 && b.clicked === 0) return <span className="inline-flex rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700">Dupla fraca · trocar</span>;
    if (a.clicked !== b.clicked) {
      const label = a.clicked > b.clicked ? "A promissora em cliques" : "B promissora em cliques";
      return <span className={"inline-flex rounded-full px-3 py-1.5 text-xs font-semibold " + (a.clicked > b.clicked ? "bg-blue-50 text-blue-700" : "bg-violet-100 text-violet-700")}>{label}</span>;
    }
    if (complete) return <span className="inline-flex rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">Empate · novo ângulo</span>;
    return <span className="inline-flex rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">Coletando até 20</span>;
  }
  if (a.purchases !== b.purchases) {
    const label = a.purchases > b.purchases ? "A na frente em compras" : "B na frente em compras";
    return <span className={"inline-flex rounded-full px-3 py-1.5 text-xs font-semibold " + (a.purchases > b.purchases ? "bg-blue-50 text-blue-700" : "bg-violet-100 text-violet-700")}>{label}</span>;
  }
  if (a.clicked !== b.clicked) {
    const label = a.clicked > b.clicked ? "A na frente em cliques" : "B na frente em cliques";
    return <span className={"inline-flex rounded-full px-3 py-1.5 text-xs font-semibold " + (a.clicked > b.clicked ? "bg-blue-50 text-blue-700" : "bg-violet-100 text-violet-700")}>{label}</span>;
  }
  return <span className="inline-flex rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">Ainda sem diferença</span>;
}

function SampleProgress({ experiment, compact = false }: { experiment: LaboratoryExperiment; compact?: boolean }) {
  const min = Math.max(1, experiment.minimum_sends_per_variant);
  const a = Math.min(100, Math.round((experiment.championLiveMetrics.sent / min) * 100));
  const b = Math.min(100, Math.round((experiment.challengerLiveMetrics.sent / min) * 100));
  const purchases = experiment.championLiveMetrics.purchases + experiment.challengerLiveMetrics.purchases;
  return <div className={compact ? "w-44" : "w-full min-w-0"}><div className="flex justify-between text-[11px] font-medium text-slate-500"><span>A {experiment.championLiveMetrics.sent}/{min}</span><span>B {experiment.challengerLiveMetrics.sent}/{min}</span></div><div className="mt-1.5 grid gap-1"><div className="h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-blue-600" style={{ width: a + "%" }} /></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-violet-600" style={{ width: b + "%" }} /></div></div><p className="mt-2 text-[11px] text-slate-500">{experiment.primary_metric === "click_rate" ? <>Limite: <strong className="text-slate-700">{min * 2} envios</strong></> : <>Compras: <strong className="text-slate-700">{purchases}/{experiment.minimum_purchases_total}</strong></>}</p></div>;
}

function LargeMetric({ label, value, helper }: { label: string; value: string; helper: string }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold tracking-tight text-slate-950">{value}</p><p className="mt-1 text-[11px] text-slate-400">{helper}</p></div>;
}

function SetupItem({ done, label, detail }: { done: boolean; label: string; detail: string }) {
  return <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-3"><span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${done ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{done ? <CheckCircle2 size={15} /> : <Clock3 size={14} />}</span><div><p className="text-sm font-semibold">{label}</p><p className="mt-0.5 text-xs text-slate-500">{detail}</p></div></div>;
}

function VariantBox({ label, variant, metrics, minimumSends, accent = false }: { label: string; variant: CopyVariant | null; metrics: CopyLiveMetrics; minimumSends: number; accent?: boolean }) {
  const progress = minimumSends ? Math.min(100, Math.round((metrics.sent / minimumSends) * 100)) : 0;
  return (
    <article className={`overflow-hidden rounded-2xl border ${accent ? "border-violet-200 bg-violet-50/60" : "border-slate-200 bg-white"}`}>
      <div className="p-5">
        <div className="flex items-center justify-between gap-3">
          <p className={`text-xs font-bold uppercase tracking-[.14em] ${accent ? "text-violet-700" : "text-blue-700"}`}>{label}</p>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${accent ? "bg-violet-100 text-violet-700" : "bg-blue-50 text-blue-700"}`}>{metrics.sent} enviados</span>
        </div>
        <p className="mt-3 min-h-12 text-base font-semibold leading-6 text-slate-950">{variant?.subject || "—"}</p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <LargeMetric label="Cliques" value={String(metrics.clicked)} helper={`CTR ${formatPercent(metrics.click_rate)}`} />
          <LargeMetric label="Compras" value={String(metrics.purchases)} helper={`Conversão ${formatPercent(metrics.conversion_rate)}`} />
          <LargeMetric label="Receita" value={formatMoney(metrics.revenue)} helper="Atribuída à versão" />
          <LargeMetric label="Receita / envio" value={formatMoney(metrics.revenue_per_sent)} helper="Eficiência" />
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between text-xs"><span className="font-medium text-slate-600">Amostra de envios</span><span className="font-semibold text-slate-800">{metrics.sent} de {minimumSends}</span></div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><div className={`h-full rounded-full ${accent ? "bg-violet-600" : "bg-blue-600"}`} style={{ width: `${progress}%` }} /></div>
        </div>
      </div>
      {variant && <details className="border-t border-slate-200 bg-white"><summary className="cursor-pointer list-none px-5 py-3 text-sm font-semibold text-blue-700">Ver copy completa e hipótese</summary><div className="border-t border-slate-100 p-5 text-sm"><CopyField label="Preheader" value={variant.preheader || "Sem preheader"} /><CopyField label="Corpo" value={variant.body} multiline /><CopyField label="Botão" value={variant.button_text} /><CopyField label="Rodapé" value={variant.footer || "Sem rodapé"} multiline />{variant.hypothesis && <CopyField label="Hipótese" value={variant.hypothesis} multiline />}</div></details>}
    </article>
  );
}

function CopyField({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) {
  return <div className="mb-3 last:mb-0"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p><p className={`mt-1 leading-6 text-slate-700 ${multiline ? "whitespace-pre-wrap" : ""}`}>{value}</p></div>;
}

function ExperimentControls({ status, experimentId, decision, primaryMetric }: { status: string; experimentId: string; decision: string | null; primaryMetric: string }) {
  return (
    <div className="flex shrink-0 flex-wrap gap-2">
      {status === "manual_review" && <><ActionButton experimentId={experimentId} action="approve_start" label="Aprovar e iniciar" icon={<Play size={15} />} /><ActionButton experimentId={experimentId} action="reject" label="Rejeitar" icon={<XCircle size={15} />} danger /></>}
      {status === "running" && <ActionButton experimentId={experimentId} action="pause" label="Pausar" icon={<Pause size={15} />} secondary />}
      {(status === "paused" || status === "ready") && <><ActionButton experimentId={experimentId} action="resume" label="Retomar" icon={<RotateCcw size={15} />} /><ActionButton experimentId={experimentId} action="reject" label="Encerrar" icon={<XCircle size={15} />} danger /></>}
      {primaryMetric !== "click_rate" && decision === "challenger_wins" && status !== "completed" && <ActionButton experimentId={experimentId} action="promote" label="Tornar campeã" icon={<Trophy size={15} />} />}
      {primaryMetric !== "click_rate" && decision === "champion_wins" && status !== "completed" && <ActionButton experimentId={experimentId} action="keep_champion" label="Manter controle" icon={<ShieldCheck size={15} />} secondary />}
      {primaryMetric === "click_rate" && status === "paused" && <span className="rounded-lg bg-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">Triagem encerrada · sem campeã</span>}
    </div>
  );
}

function ActionButton({ experimentId, action, label, icon, danger = false, secondary = false }: { experimentId: string; action: string; label: string; icon: React.ReactNode; danger?: boolean; secondary?: boolean }) {
  const tone = danger ? "border-red-200 bg-white text-red-700 hover:bg-red-50" : secondary ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-100" : "border-blue-600 bg-blue-600 text-white hover:bg-blue-700";
  return <form action={runExperimentAction}><input type="hidden" name="experiment_id" value={experimentId} /><input type="hidden" name="experiment_action" value={action} /><button className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition ${tone}`}>{icon}{label}</button></form>;
}

function Schedule({ icon, title, time, detail }: { icon: React.ReactNode; title: string; time: string; detail: string }) {
  return <div className="flex gap-3 rounded-xl bg-slate-50 p-3.5"><span className="mt-0.5 text-blue-600">{icon}</span><div><p className="text-sm font-semibold">{title}</p><p className="mt-0.5 text-xs font-medium text-blue-700">{time}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div></div>;
}

function Status({ value }: { value: string }) {
  const labels: Record<string, string> = { shadow: "Modo sombra", manual_review: "Aguardando revisão", ready: "Pronto para teste", running: "Em teste", paused: "Pausado", completed: "Concluído", cancelled: "Cancelado" };
  const tone = value === "running" ? "bg-emerald-100 text-emerald-800" : value === "manual_review" ? "bg-amber-100 text-amber-800" : value === "completed" ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-700";
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tone}`}>{labels[value] || value}</span>;
}

function TournamentStatus({ value }: { value: string }) {
  const labels: Record<string, string> = {
    queued: "Na fila",
    manual_review: "Aguardando aprovação",
    testing: "Em teste agora",
    completed: "Concluída",
    skipped: "Descartada",
  };
  const tone = value === "testing"
    ? "bg-emerald-100 text-emerald-800"
    : value === "manual_review"
      ? "bg-amber-100 text-amber-800"
      : value === "completed"
        ? "bg-blue-100 text-blue-800"
        : "bg-slate-100 text-slate-700";
  return <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${tone}`}>{labels[value] || value}</span>;
}

function metricNumber(metrics: Record<string, unknown> | CopyLiveMetrics, key: string) {
  const value = Number((metrics as Record<string, unknown>)[key]);
  return Number.isFinite(value) ? value : 0;
}

function statisticalObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function angleLabel(value: string) {
  const labels: Record<string, string> = {
    curiosidade_sem_pressao: "Curiosidade sem pressão",
    desejo_e_identificacao: "Desejo e identificação",
    quebra_de_objecao: "Quebra de objeção",
    direta_e_curta: "Direta e curta",
  };
  return labels[value] || value.replaceAll("_", " ");
}

function stageLabel(value: string) {
  return value === "confirmation" ? "Confirmação final" : "Triagem rápida";
}

function modeLabel(value?: string | null) {
  if (value === "automatic") return "Automático";
  if (value === "manual_approval") return "Aprovação manual";
  return "Modo sombra";
}

function assetLabel(value: string) {
  const labels: Record<string, string> = { video_transcript: "Transcrição", offer_rules: "Oferta", brand_rules: "Linguagem", legacy_copy: "Copy antiga", research_note: "Análise" };
  return labels[value] || value;
}

function previewText(value: string, limit: number) {
  if (value.length <= limit) return value;
  return value.slice(0, limit).trimEnd() + "\n\n[…]";
}

function orderExperiments<T extends { platform: string; recovery_flow: string; step: number; created_at: string }>(experiments: T[]) {
  const flowOrder = ["ABANDONED", "WAITING_PAYMENT", "CANCELED", "DELAYED", "EXPIRED"];
  return [...experiments].sort((a, b) => {
    const platform = Number(b.platform === "perfectpay") - Number(a.platform === "perfectpay");
    if (platform) return platform;
    const flow = flowOrder.indexOf(a.recovery_flow) - flowOrder.indexOf(b.recovery_flow);
    if (flow) return flow;
    if (a.step !== b.step) return a.step - b.step;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}
