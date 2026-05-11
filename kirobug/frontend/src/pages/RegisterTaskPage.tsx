import { useEffect, useState } from 'react'
import {
  Card,
  Form,
  Input,
  InputNumber,
  Select,
  Button,
  Checkbox,
  Tag,
  Space,
  Typography,
  Descriptions,
} from 'antd'
import {
  PlayCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
} from '@ant-design/icons'
import { ChatGPTRegistrationModeSwitch } from '@/components/ChatGPTRegistrationModeSwitch'
import { TaskLogPanel } from '@/components/TaskLogPanel'
import { usePersistentChatGPTRegistrationMode } from '@/hooks/usePersistentChatGPTRegistrationMode'
import { parseBooleanConfigValue } from '@/lib/configValueParsers'
import { buildChatGPTRegistrationRequestAdapter } from '@/lib/chatgptRegistrationRequestAdapter'
import { getExecutorOptions, normalizeExecutorForPlatform } from '@/lib/platformExecutorOptions'
import { apiFetch } from '@/lib/utils'

const { Text } = Typography

function resolveEffectiveMailProvider(mailProvider: string, mailImportSource: string) {
  if (mailProvider !== 'mail_import') return mailProvider
  return mailImportSource === 'applemail' ? 'applemail' : 'microsoft'
}

export default function RegisterTaskPage() {
  const [form] = Form.useForm()
  const [task, setTask] = useState<any>(null)
  const [polling, setPolling] = useState(false)
  const { mode: chatgptRegistrationMode, setMode: setChatgptRegistrationMode } =
    usePersistentChatGPTRegistrationMode()

  useEffect(() => {
    apiFetch('/config').then((cfg) => {
      const currentPlatform = form.getFieldValue('platform') || 'chatgpt'
      const configMailProvider = String(cfg.mail_provider || 'luckmail')
      const isMailImportProvider = configMailProvider === 'microsoft' || configMailProvider === 'outlook' || configMailProvider === 'applemail'
      form.setFieldsValue({
        executor_type: normalizeExecutorForPlatform(currentPlatform, cfg.default_executor),
        captcha_solver: cfg.default_captcha_solver || 'yescaptcha',
        mail_provider: isMailImportProvider ? 'mail_import' : configMailProvider,
        mail_import_source: configMailProvider === 'applemail' ? 'applemail' : 'microsoft',
        applemail_base_url: cfg.applemail_base_url || 'https://www.appleemail.top',
        applemail_pool_dir: cfg.applemail_pool_dir || 'mail',
        applemail_pool_file: cfg.applemail_pool_file || '',
        applemail_mailboxes: cfg.applemail_mailboxes || 'INBOX,Junk',
        yescaptcha_key: cfg.yescaptcha_key || '',
        moemail_api_url: cfg.moemail_api_url || '',
        moemail_api_key: cfg.moemail_api_key || '',
        skymail_api_base: cfg.skymail_api_base || 'https://api.skymail.ink',
        skymail_token: cfg.skymail_token || '',
        skymail_domain: cfg.skymail_domain || '',
        cloudmail_api_base: cfg.cloudmail_api_base || '',
        cloudmail_admin_email: cfg.cloudmail_admin_email || '',
        cloudmail_admin_password: cfg.cloudmail_admin_password || '',
        cloudmail_domain: cfg.cloudmail_domain || '',
        cloudmail_subdomain: cfg.cloudmail_subdomain || '',
        cloudmail_timeout: cfg.cloudmail_timeout || 30,
        outlook_backend: cfg.outlook_backend || 'graph',
        laoudo_auth: cfg.laoudo_auth || '',
        laoudo_email: cfg.laoudo_email || '',
        laoudo_account_id: cfg.laoudo_account_id || '',
        gptmail_base_url: cfg.gptmail_base_url || 'https://mail.chatgpt.org.uk',
        gptmail_api_key: cfg.gptmail_api_key || '',
        gptmail_domain: cfg.gptmail_domain || '',
        opentrashmail_api_url: cfg.opentrashmail_api_url || '',
        opentrashmail_domain: cfg.opentrashmail_domain || '',
        opentrashmail_password: cfg.opentrashmail_password || '',
        maliapi_base_url: cfg.maliapi_base_url || 'https://maliapi.215.im/v1',
        maliapi_api_key: cfg.maliapi_api_key || '',
        maliapi_domain: cfg.maliapi_domain || '',
        maliapi_auto_domain_strategy: cfg.maliapi_auto_domain_strategy || 'balanced',
        duckmail_api_url: cfg.duckmail_api_url || '',
        duckmail_provider_url: cfg.duckmail_provider_url || '',
        duckmail_bearer: cfg.duckmail_bearer || '',
        freemail_api_url: cfg.freemail_api_url || '',
        freemail_admin_token: cfg.freemail_admin_token || '',
        freemail_username: cfg.freemail_username || '',
        freemail_password: cfg.freemail_password || '',
        freemail_domain: cfg.freemail_domain || '',
        cfworker_api_url: cfg.cfworker_api_url || '',
        cfworker_admin_token: cfg.cfworker_admin_token || '',
        cfworker_custom_auth: cfg.cfworker_custom_auth || '',
        cfworker_domain_override: '',
        cfworker_subdomain: cfg.cfworker_subdomain || '',
        cfworker_random_subdomain: parseBooleanConfigValue(cfg.cfworker_random_subdomain),
        cfworker_random_name_subdomain: parseBooleanConfigValue(cfg.cfworker_random_name_subdomain),
        cfworker_fingerprint: cfg.cfworker_fingerprint || '',
        smstome_cookie: cfg.smstome_cookie || '',
        smstome_country_slugs: cfg.smstome_country_slugs || '',
        smstome_phone_attempts: cfg.smstome_phone_attempts || '',
        smstome_otp_timeout_seconds: cfg.smstome_otp_timeout_seconds || '',
        smstome_poll_interval_seconds: cfg.smstome_poll_interval_seconds || '',
        smstome_sync_max_pages_per_country: cfg.smstome_sync_max_pages_per_country || '',
        luckmail_base_url: cfg.luckmail_base_url || 'https://mails.luckyous.com/',
        luckmail_api_key: cfg.luckmail_api_key || '',
        luckmail_email_type: cfg.luckmail_email_type || '',
        luckmail_domain: cfg.luckmail_domain || '',
      })
    })
  }, [form])

  const submit = async () => {
    const values = await form.validateFields()
    const effectiveMailProvider = resolveEffectiveMailProvider(values.mail_provider, values.mail_import_source)
    const registerExtra = {
      mail_provider: effectiveMailProvider,
      applemail_base_url: values.applemail_base_url,
      applemail_pool_dir: values.applemail_pool_dir,
      applemail_pool_file: values.applemail_pool_file,
      applemail_mailboxes: values.applemail_mailboxes,
      laoudo_auth: values.laoudo_auth,
      laoudo_email: values.laoudo_email,
      laoudo_account_id: values.laoudo_account_id,
      gptmail_base_url: values.gptmail_base_url,
      gptmail_api_key: values.gptmail_api_key,
      gptmail_domain: values.gptmail_domain,
      opentrashmail_api_url: values.opentrashmail_api_url,
      opentrashmail_domain: values.opentrashmail_domain,
      opentrashmail_password: values.opentrashmail_password,
      maliapi_base_url: values.maliapi_base_url,
      maliapi_api_key: values.maliapi_api_key,
      maliapi_domain: values.maliapi_domain,
      maliapi_auto_domain_strategy: values.maliapi_auto_domain_strategy,
      moemail_api_url: values.moemail_api_url,
      moemail_api_key: values.moemail_api_key,
      skymail_api_base: values.skymail_api_base,
      skymail_token: values.skymail_token,
      skymail_domain: values.skymail_domain,
      cloudmail_api_base: values.cloudmail_api_base,
      cloudmail_admin_email: values.cloudmail_admin_email,
      cloudmail_admin_password: values.cloudmail_admin_password,
      cloudmail_domain: values.cloudmail_domain,
      cloudmail_subdomain: values.cloudmail_subdomain,
      cloudmail_timeout: values.cloudmail_timeout,
      outlook_backend: values.outlook_backend,
      duckmail_api_url: values.duckmail_api_url,
      duckmail_provider_url: values.duckmail_provider_url,
      duckmail_bearer: values.duckmail_bearer,
      freemail_api_url: values.freemail_api_url,
      freemail_admin_token: values.freemail_admin_token,
      freemail_username: values.freemail_username,
      freemail_password: values.freemail_password,
      freemail_domain: values.freemail_domain,
      cfworker_api_url: values.cfworker_api_url,
      cfworker_admin_token: values.cfworker_admin_token,
      cfworker_custom_auth: values.cfworker_custom_auth,
      cfworker_domain_override: values.cfworker_domain_override,
      cfworker_subdomain: values.cfworker_subdomain,
      cfworker_random_subdomain: values.cfworker_random_subdomain,
      cfworker_random_name_subdomain: values.cfworker_random_name_subdomain,
      cfworker_fingerprint: values.cfworker_fingerprint,
      smstome_cookie: values.smstome_cookie,
      smstome_country_slugs: values.smstome_country_slugs,
      smstome_phone_attempts: values.smstome_phone_attempts,
      smstome_otp_timeout_seconds: values.smstome_otp_timeout_seconds,
      smstome_poll_interval_seconds: values.smstome_poll_interval_seconds,
      smstome_sync_max_pages_per_country: values.smstome_sync_max_pages_per_country,
      luckmail_base_url: values.luckmail_base_url,
      luckmail_api_key: values.luckmail_api_key,
      luckmail_email_type: values.luckmail_email_type,
      luckmail_domain: values.luckmail_domain,
      yescaptcha_key: values.yescaptcha_key,
      solver_url: values.solver_url,
    }
    const chatgptRegistrationRequestAdapter =
      buildChatGPTRegistrationRequestAdapter(
        values.platform,
        chatgptRegistrationMode,
      )
    const adaptedRegisterExtra = chatgptRegistrationRequestAdapter
      ? chatgptRegistrationRequestAdapter.extendExtra(registerExtra)
      : registerExtra

    const res = await apiFetch('/tasks/register', {
      method: 'POST',
      body: JSON.stringify({
        platform: values.platform,
        email: values.email || null,
        password: values.password || null,
        count: values.count,
        concurrency: values.concurrency,
        register_delay_seconds: values.register_delay_seconds || 0,
        proxy: values.proxy || null,
        executor_type: values.executor_type,
        captcha_solver: values.captcha_solver,
        extra: adaptedRegisterExtra,
      }),
    })
    setTask(res)
    setPolling(true)
    pollTask(res.task_id)
  }

  const pollTask = async (id: string) => {
    const interval = setInterval(async () => {
      const t = await apiFetch(`/tasks/${id}`)
      setTask(t)
      if (t.status === 'done' || t.status === 'failed' || t.status === 'stopped') {
        clearInterval(interval)
        setPolling(false)
        if (t.cashier_urls && t.cashier_urls.length > 0) {
          t.cashier_urls.forEach((url: string) => window.open(url, '_blank'))
        }
      }
    }, 2000)
  }

  const mailProviderRaw = Form.useWatch('mail_provider', form)
  const mailImportSource = Form.useWatch('mail_import_source', form)
  const mailProvider = resolveEffectiveMailProvider(String(mailProviderRaw || ''), String(mailImportSource || 'microsoft'))
  const captchaSolver = Form.useWatch('captcha_solver', form)
  const platform = Form.useWatch('platform', form)
  const executorOptions = getExecutorOptions(platform)

  useEffect(() => {
    const currentExecutor = form.getFieldValue('executor_type')
    const normalizedExecutor = normalizeExecutorForPlatform(platform, currentExecutor)
    if (currentExecutor !== normalizedExecutor) {
      form.setFieldValue('executor_type', normalizedExecutor)
    }
  }, [form, platform])

  return (
    <div style={{ maxWidth: 800 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 'bold', margin: 0 }}>Tarefa de Registro</h1>
        <p style={{ color: '#7a8ba3', marginTop: 4 }}>Criar tarefa de registro automático de contas</p>
      </div>

      <Form form={form} layout="vertical" onFinish={submit} initialValues={{
        platform: 'chatgpt',
        executor_type: 'protocol',
        captcha_solver: 'yescaptcha',
        mail_provider: 'luckmail',
        mail_import_source: 'microsoft',
        applemail_base_url: 'https://www.appleemail.top',
        applemail_pool_dir: 'mail',
        applemail_mailboxes: 'INBOX,Junk',
        outlook_backend: 'graph',
        gptmail_base_url: 'https://mail.chatgpt.org.uk',
        cloudmail_timeout: 30,
        count: 1,
        concurrency: 1,
        register_delay_seconds: 0,
        maliapi_base_url: 'https://maliapi.215.im/v1',
        maliapi_auto_domain_strategy: 'balanced',
        solver_url: 'http://localhost:8889',
      }}>
        <Card title="Configuração Básica" style={{ marginBottom: 16 }}>
          <Form.Item name="platform" label="Plataforma" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'chatgpt', label: 'ChatGPT' },
                { value: 'cursor', label: 'Cursor' },
                { value: 'kiro', label: 'Kiro' },
                { value: 'grok', label: 'Grok' },
                { value: 'tavily', label: 'Tavily' },
                { value: 'openblocklabs', label: 'OpenBlockLabs' },
              ]}
            />
          </Form.Item>
          <Form.Item name="executor_type" label="Executor" rules={[{ required: true }]}>
            <Select options={executorOptions} />
          </Form.Item>
          <Form.Item name="captcha_solver" label="CAPTCHA" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'yescaptcha', label: 'YesCaptcha' },
                { value: 'local_solver', label: 'Solver Local (Camoufox)' },
                { value: 'manual', label: 'Manual' },
              ]}
            />
          </Form.Item>
          <Space style={{ width: '100%' }}>
            <Form.Item name="count" label="Quantidade" style={{ flex: 1 }}>
              <Input type="number" min={1} />
            </Form.Item>
            <Form.Item name="concurrency" label="Concorrência" style={{ flex: 1 }}>
              <Input type="number" min={1} />
            </Form.Item>
          </Space>
          <Space style={{ width: '100%' }}>
            <Form.Item name="register_delay_seconds" label="Atraso por registro (s)" style={{ flex: 1 }}>
              <InputNumber min={0} precision={1} step={0.5} style={{ width: '100%' }} placeholder="0" />
            </Form.Item>
            <Form.Item name="proxy" label="Proxy (opcional)" style={{ flex: 1 }}>
              <Input placeholder="http://user:pass@host:port" />
            </Form.Item>
          </Space>
          {platform === 'chatgpt' && (
            <Form.Item label="ChatGPT Token 方案">
              <ChatGPTRegistrationModeSwitch
                mode={chatgptRegistrationMode}
                onChange={setChatgptRegistrationMode}
              />
            </Form.Item>
          )}
        </Card>

        <Card title="Configuração de Email" style={{ marginBottom: 16 }}>
          <Form.Item name="mail_provider" label="Serviço de Email" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'luckmail', label: 'LuckMail' },
                { value: 'mail_import', label: 'Importar Email' },
                { value: 'moemail', label: 'MoeMail (sall.cc)' },
                { value: 'tempmail_lol', label: 'TempMail.lol' },
                { value: 'skymail', label: 'SkyMail (CloudMail)' },
                { value: 'cloudmail', label: 'CloudMail (genToken)' },
                { value: 'maliapi', label: 'YYDS Mail / MaliAPI' },
                { value: 'gptmail', label: 'GPTMail' },
                { value: 'opentrashmail', label: 'OpenTrashMail' },
                { value: 'duckmail', label: 'DuckMail' },
                { value: 'freemail', label: 'Freemail' },
                { value: 'laoudo', label: 'Laoudo' },
                { value: 'cfworker', label: 'CF Worker' },
              ]}
            />
          </Form.Item>
          {mailProviderRaw === 'mail_import' && (
            <Form.Item name="mail_import_source" label="Tipo de importação" rules={[{ required: true }]}>
              <Select
                options={[
                  { value: 'microsoft', label: 'Microsoft (Outlook / Hotmail)' },
                  { value: 'applemail', label: 'AppleMail' },
                ]}
              />
            </Form.Item>
          )}
          {mailProvider === 'microsoft' && (
            <Form.Item
              name="outlook_backend"
              label="Método de recebimento Microsoft"
              extra="Padrão: Graph. Se a conta não tiver credenciais OAuth, cai automaticamente para IMAP."
            >
              <Select
                options={[
                  { value: 'graph', label: 'Graph (padrão)' },
                  { value: 'imap', label: 'IMAP' },
                ]}
              />
            </Form.Item>
          )}
          {mailProvider === 'skymail' && (
            <>
              <Form.Item name="skymail_api_base" label="API Base">
                <Input placeholder="https://api.skymail.ink" />
              </Form.Item>
              <Form.Item name="skymail_token" label="Authorization Token">
                <Input.Password placeholder="Bearer xxxxx" />
              </Form.Item>
              <Form.Item name="skymail_domain" label="Domínio de email">
                <Input placeholder="mail.example.com" />
              </Form.Item>
            </>
          )}
          {mailProvider === 'cloudmail' && (
            <>
              <Form.Item name="cloudmail_api_base" label="API Base" rules={[{ required: true, message: 'Insira o endereço da API CloudMail' }]}>
                <Input placeholder="https://cloudmail.example.com" />
              </Form.Item>
              <Form.Item name="cloudmail_admin_email" label="Email do admin (opcional)" extra="Deixe em branco para usar admin@domínio automaticamente">
                <Input placeholder="admin@example.com" />
              </Form.Item>
              <Form.Item name="cloudmail_admin_password" label="Senha do admin" rules={[{ required: true, message: 'Insira a senha do admin CloudMail' }]}>
                <Input.Password placeholder="admin password" />
              </Form.Item>
              <Form.Item name="cloudmail_domain" label="Domínio de email (opcional)" extra="Suporta um domínio ou múltiplos separados por vírgula">
                <Input placeholder="mail.example.com,mail2.example.com" />
              </Form.Item>
              <Form.Item name="cloudmail_subdomain" label="Subdomínio (opcional)">
                <Input placeholder="pool-a" />
              </Form.Item>
              <Form.Item name="cloudmail_timeout" label="Timeout da requisição (s)">
                <InputNumber min={5} max={120} style={{ width: '100%' }} />
              </Form.Item>
            </>
          )}
          {mailProvider === 'laoudo' && (
            <>
              <Form.Item name="laoudo_email" label="Endereço de email">
                <Input placeholder="xxx@laoudo.com" />
              </Form.Item>
              <Form.Item name="laoudo_account_id" label="Account ID">
                <Input placeholder="563" />
              </Form.Item>
              <Form.Item name="laoudo_auth" label="JWT Token">
                <Input placeholder="eyJ..." />
              </Form.Item>
            </>
          )}
          {mailProvider === 'maliapi' && (
            <>
              <Form.Item name="maliapi_base_url" label="API URL">
                <Input placeholder="https://maliapi.215.im/v1" />
              </Form.Item>
              <Form.Item name="maliapi_api_key" label="API Key">
                <Input.Password placeholder="AC-..." />
              </Form.Item>
              <Form.Item name="maliapi_domain" label="Domínio de email (opcional)">
                <Input placeholder="example.com" />
              </Form.Item>
              <Form.Item name="maliapi_auto_domain_strategy" label="Estratégia de domínio automático">
                <Select
                  options={[
                    { value: 'balanced', label: 'balanced' },
                    { value: 'prefer_owned', label: 'prefer_owned' },
                    { value: 'prefer_public', label: 'prefer_public' },
                  ]}
                />
              </Form.Item>
            </>
          )}
          {mailProvider === 'applemail' && (
            <>
              <Form.Item name="applemail_base_url" label="API URL">
                <Input placeholder="https://www.appleemail.top" />
              </Form.Item>
              <Form.Item
                name="applemail_pool_dir"
                label="Diretório do pool de emails"
                extra="Padrão: diretório 'mail' na raiz do projeto."
              >
                <Input placeholder="mail" />
              </Form.Item>
              <Form.Item
                name="applemail_pool_file"
                label="Arquivo do pool (opcional)"
                extra="Deixe em branco para usar automaticamente o .json/.txt mais recente do diretório."
              >
                <Input placeholder="applemail_20260403.json" />
              </Form.Item>
              <Form.Item name="applemail_mailboxes" label="Pastas para verificar">
                <Input placeholder="INBOX,Junk" />
              </Form.Item>
            </>
          )}
          {mailProvider === 'gptmail' && (
            <>
              <Form.Item name="gptmail_base_url" label="API URL">
                <Input placeholder="https://mail.chatgpt.org.uk" />
              </Form.Item>
              <Form.Item name="gptmail_api_key" label="API Key">
                <Input.Password placeholder="gpt-test" />
              </Form.Item>
              <Form.Item
                name="gptmail_domain"
                label="Domínio de email (opcional)"
                extra="Se conhecido, gera endereço aleatório localmente sem requisição extra."
              >
                <Input placeholder="example.com" />
              </Form.Item>
            </>
          )}
          {mailProvider === 'opentrashmail' && (
            <>
              <Form.Item name="opentrashmail_api_url" label="API URL" rules={[{ required: true, message: 'Insira o endereço do OpenTrashMail' }]}>
                <Input placeholder="http://mail.example.com:8085" />
              </Form.Item>
              <Form.Item
                name="opentrashmail_domain"
                label="Domínio de email (opcional)"
                extra="Se conhecido, gera endereço localmente; senão chama /api/random."
              >
                <Input placeholder="xiyoufm.com" />
              </Form.Item>
              <Form.Item
                name="opentrashmail_password"
                label="Senha do site (opcional)"
                extra="Preencha quando o OpenTrashMail tiver proteção por senha."
              >
                <Input.Password placeholder="Deixe em branco se não habilitado" />
              </Form.Item>
            </>
          )}
          {mailProvider === 'cfworker' && (
            <>
              <Form.Item name="cfworker_api_url" label="API URL">
                <Input placeholder="https://apimail.example.com" />
              </Form.Item>
              <Form.Item name="cfworker_admin_token" label="Admin Token">
                <Input placeholder="abc123,,,abc" />
              </Form.Item>
              <Form.Item name="cfworker_custom_auth" label="Site Password">
                <Input.Password placeholder="private site password" />
              </Form.Item>
              <Form.Item
                name="cfworker_domain_override"
                label="Domínio específico para esta tarefa (opcional)"
                extra="Deixe em branco para selecionar aleatoriamente da lista de domínios habilitados."
              >
                <Input placeholder="example.com" />
              </Form.Item>
              <Form.Item
                name="cfworker_subdomain"
                label="Subdomínio (opcional)"
                extra="Gera xxx@subdomínio.domínio; com subdomínio aleatório: xxx@valor.subdomínio.domínio."
              >
                <Input placeholder="mail / pool-a" />
              </Form.Item>
              <Form.Item name="cfworker_random_subdomain" valuePropName="checked">
                <Checkbox>Gerar subdomínio aleatório a cada registro</Checkbox>
              </Form.Item>
              <Form.Item name="cfworker_random_name_subdomain" valuePropName="checked">
                <Checkbox>Usar nome aleatório como subdomínio</Checkbox>
              </Form.Item>
              <Form.Item name="cfworker_fingerprint" label="Fingerprint (可选)">
                <Input placeholder="cfb82279f..." />
              </Form.Item>
            </>
          )}
          {mailProvider === 'freemail' && (
            <>
              <Form.Item name="freemail_api_url" label="API URL" rules={[{ required: true, message: 'Insira o endereço da API Freemail' }]}>
                <Input placeholder="https://mail.example.com" />
              </Form.Item>
              <Form.Item name="freemail_admin_token" label="Token de admin (opcional)">
                <Input.Password placeholder="JWT_TOKEN" />
              </Form.Item>
              <Form.Item name="freemail_username" label="Usuário (opcional)">
                <Input placeholder="admin" />
              </Form.Item>
              <Form.Item name="freemail_password" label="Senha (opcional)">
                <Input.Password placeholder="password" />
              </Form.Item>
              <Form.Item name="freemail_domain" label="Domínio de email (opcional)" extra="Se preenchido, será usado preferencialmente para gerar emails">
                <Input placeholder="example.com" />
              </Form.Item>
            </>
          )}
          {mailProvider === 'luckmail' && (
            <>
              <Form.Item name="luckmail_base_url" label="Endereço da plataforma">
                <Input placeholder="https://mails.luckyous.com" />
              </Form.Item>
              <Form.Item name="luckmail_api_key" label="API Key">
                <Input.Password placeholder="ak_..." />
              </Form.Item>
              <Form.Item name="luckmail_email_type" label="Tipo de email (opcional)">
                <Select
                  options={[
                    { value: '', label: 'Automático / em branco' },
                    { value: 'ms_graph', label: 'Microsoft - Graph' },
                    { value: 'ms_imap', label: 'Microsoft - IMAP' },
                    { value: 'self_built', label: 'Email próprio' },
                  ]}
                />
              </Form.Item>
              <Form.Item name="luckmail_domain" label="Domínio de email (opcional)">
                <Input placeholder="outlook.com" />
              </Form.Item>
            </>
          )}
        </Card>

        {platform === 'chatgpt' && (
          <Card title="ChatGPT — Verificação por telefone" style={{ marginBottom: 16 }}>
            <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
              Usado apenas quando o fluxo OAuth chega ao passo `add_phone`. Obtém número automaticamente e aguarda o SMS.
            </Text>
            <Form.Item name="smstome_cookie" label="SMSToMe Cookie">
              <Input.Password placeholder="cf_clearance=...; PHPSESSID=..." />
            </Form.Item>
            <Form.Item name="smstome_country_slugs" label="Lista de países">
              <Input placeholder="united-kingdom,poland,finland" />
            </Form.Item>
            <Form.Item name="smstome_phone_attempts" label="Tentativas de número de telefone">
              <Input placeholder="3" />
            </Form.Item>
            <Form.Item name="smstome_otp_timeout_seconds" label="Timeout para SMS (s)">
              <Input placeholder="45" />
            </Form.Item>
            <Form.Item name="smstome_poll_interval_seconds" label="Intervalo de polling (s)">
              <Input placeholder="5" />
            </Form.Item>
            <Form.Item name="smstome_sync_max_pages_per_country" label="Páginas sincronizadas por país">
              <Input placeholder="5" />
            </Form.Item>
          </Card>
        )}

        {captchaSolver === 'yescaptcha' && (
          <Card title="Configuração de CAPTCHA" style={{ marginBottom: 16 }}>
            <Form.Item name="yescaptcha_key" label="YesCaptcha Key">
              <Input />
            </Form.Item>
          </Card>
        )}

        {captchaSolver === 'local_solver' && (
          <Card title="Configuração do Solver Local" style={{ marginBottom: 16 }}>
            <Form.Item name="solver_url" label="Solver URL">
              <Input />
            </Form.Item>
            <Text type="secondary" style={{ fontSize: 12 }}>
              启动命令: python services/turnstile_solver/start.py --browser_type camoufox --port 8889
            </Text>
          </Card>
        )}

        <Button type="primary" htmlType="submit" block disabled={polling} icon={polling ? <LoadingOutlined /> : <PlayCircleOutlined />}>
          {polling ? 'Registrando...' : 'Iniciar Registro'}
        </Button>
      </Form>

      {task && (
        <Card title={
          <Space>
            <span>Status da Tarefa</span>
            <Tag color={
              task.status === 'done' ? 'success' :
              task.status === 'stopped' ? 'warning' :
              task.status === 'failed' ? 'error' : 'processing'
            }>
              {task.status}
            </Tag>
          </Space>
        } style={{ marginTop: 16 }}>
          <Descriptions column={1} size="small">
            <Descriptions.Item label="Task ID">
              <Text copyable style={{ fontFamily: 'monospace' }}>{task.id}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Progresso">{task.progress}</Descriptions.Item>
            <Descriptions.Item label="Pulados">{task.skipped ?? 0}</Descriptions.Item>
          </Descriptions>
          {task.success != null && (
            <div style={{ marginTop: 8, color: '#10b981' }}>
              <CheckCircleOutlined /> Sucesso: {task.success}
            </div>
          )}
          {task.errors?.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {task.errors.map((e: string, i: number) => (
                <div key={i} style={{ color: '#ef4444', marginBottom: 4 }}>
                  <CloseCircleOutlined /> {e}
                </div>
              ))}
            </div>
          )}
          {task.error && (
            <div style={{ marginTop: 8, color: '#ef4444' }}>
              <CloseCircleOutlined /> {task.error}
            </div>
          )}
          {task.id ? (
            <div style={{ marginTop: 16 }}>
              <TaskLogPanel taskId={task.id} />
            </div>
          ) : null}
        </Card>
      )}
    </div>
  )
}
