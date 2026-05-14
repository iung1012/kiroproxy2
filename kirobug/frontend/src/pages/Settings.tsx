import { useEffect, useRef, useState } from 'react'
import { App, Card, Form, Input, Select, Button, message, Tabs, Space, Tag, Typography, Modal, QRCode, Switch, Alert } from 'antd'
import {
  SaveOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  MailOutlined,
  SafetyOutlined,
  ApiOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
  PlusOutlined,
  LockOutlined,
} from '@ant-design/icons'
import { parseBooleanConfigValue } from '@/lib/configValueParsers'
import MailImportPanel from '@/components/settings/MailImportPanel'
import { apiFetch } from '@/lib/utils'

function resolveEffectiveMailProvider(mailProvider: string, mailImportSource: string) {
  if (mailProvider !== 'mail_import') return mailProvider
  return mailImportSource === 'applemail' ? 'applemail' : 'microsoft'
}

const SELECT_FIELDS: Record<string, { label: string; value: string }[]> = {
  mail_provider: [
    { label: 'LuckMail (pedido de código / e-mail comprado)', value: 'luckmail' },
    { label: 'Importar E-mail', value: 'mail_import' },
    { label: 'Laoudo (e-mail fixo)', value: 'laoudo' },
    { label: 'TempMail.lol (gerado automaticamente)', value: 'tempmail_lol' },
    { label: 'SkyMail (interface CloudMail)', value: 'skymail' },
    { label: 'CloudMail (modo genToken)', value: 'cloudmail' },
    { label: 'DuckMail (gerado automaticamente)', value: 'duckmail' },
    { label: 'MoeMail (sall.cc)', value: 'moemail' },
    { label: 'YYDS Mail / MaliAPI', value: 'maliapi' },
    { label: 'GPTMail', value: 'gptmail' },
    { label: 'OpenTrashMail', value: 'opentrashmail' },
    { label: 'Freemail (CF Worker próprio)', value: 'freemail' },
    { label: 'CF Worker (domínio próprio)', value: 'cfworker' },
  ],
  maliapi_auto_domain_strategy: [
    { label: 'balanced', value: 'balanced' },
    { label: 'prefer_owned', value: 'prefer_owned' },
    { label: 'prefer_public', value: 'prefer_public' },
  ],
  default_executor: [
    { label: 'Protocolo API (sem navegador)', value: 'protocol' },
    { label: 'Navegador sem interface (headless)', value: 'headless' },
    { label: 'Navegador com interface (headed)', value: 'headed' },
  ],
  default_captcha_solver: [
    { label: 'YesCaptcha', value: 'yescaptcha' },
    { label: 'Solver Local (Camoufox)', value: 'local_solver' },
    { label: 'Manual', value: 'manual' },
  ],
  outlook_backend: [
    { label: 'Graph (padrão)', value: 'graph' },
    { label: 'IMAP', value: 'imap' },
  ],
  luckmail_email_type: [
    { label: 'Automático / Vazio', value: '' },
    { label: 'Microsoft - Graph', value: 'ms_graph' },
    { label: 'Microsoft - IMAP', value: 'ms_imap' },
    { label: 'E-mail próprio', value: 'self_built' },
  ],
  cpa_cleanup_enabled: [
    { label: 'Desativado', value: '0' },
    { label: 'Ativado', value: '1' },
  ],
  codex_proxy_upload_type: [
    { label: 'AT (Access Token, recomendado)', value: 'at' },
    { label: 'RT (Refresh Token)', value: 'rt' },
  ],
  external_apps_update_mode: [
    { label: 'latest semver tag (recomendado)', value: 'tag' },
    { label: 'Branch HEAD', value: 'branch' },
  ],
}

const TAB_ITEMS = [
  {
    key: 'register',
    label: 'Registro',
    icon: <ApiOutlined />,
    sections: [
      {
        title: 'Método de Registro Padrão',
        desc: 'Controla como as tarefas de registro são executadas',
        fields: [{ key: 'default_executor', label: 'Tipo de Executor', type: 'select' }],
      },
    ],
  },
  {
    key: 'mailbox',
    label: 'E-mail',
    icon: <MailOutlined />,
    sections: [
      {
        title: 'Serviço de E-mail Padrão',
        desc: 'Selecione o tipo de e-mail usado no registro',
        fields: [
          { key: 'mail_provider', label: 'Serviço de E-mail', type: 'select' },
          { key: 'mailbox_otp_timeout_seconds', label: 'Tempo de espera pelo código (segundos)', placeholder: 'Ex: 60 / 90 / 120' },
        ],
      },
      {
        title: 'Laoudo',
        desc: 'E-mail fixo, configuração manual',
        fields: [
          { key: 'laoudo_email', label: 'Endereço de e-mail', placeholder: 'xxx@laoudo.com' },
          { key: 'laoudo_account_id', label: 'Account ID', placeholder: '563' },
          { key: 'laoudo_auth', label: 'JWT Token', placeholder: 'eyJ...', secret: true },
        ],
      },
      {
        title: 'Freemail',
        desc: 'E-mail próprio baseado em Cloudflare Worker, suporta token de admin ou usuário/senha',
        fields: [
          { key: 'freemail_api_url', label: 'API URL', placeholder: 'https://mail.example.com' },
          { key: 'freemail_admin_token', label: 'Token de Admin', secret: true },
          { key: 'freemail_username', label: 'Usuário (opcional)' },
          { key: 'freemail_password', label: 'Senha (opcional)', secret: true },
          { key: 'freemail_domain', label: 'Domínio do e-mail (opcional)', placeholder: 'example.com' },
        ],
      },
      {
        title: 'MoeMail',
        desc: 'Registra conta automaticamente e gera e-mail temporário',
        fields: [
          { key: 'moemail_api_url', label: 'API URL', placeholder: 'https://sall.cc' },
          { key: 'moemail_api_key', label: 'API Key', secret: true },
        ],
      },
      {
        title: 'SkyMail',
        desc: 'Interface compatível com CloudMail (addUser / emailList)',
        fields: [
          { key: 'skymail_api_base', label: 'API Base', placeholder: 'https://api.skymail.ink' },
          { key: 'skymail_token', label: 'Authorization Token', secret: true },
          { key: 'skymail_domain', label: 'Domínio do e-mail', placeholder: 'mail.example.com' },
        ],
      },
      {
        title: 'CloudMail',
        desc: 'Modo genToken do CloudMail (genToken + emailList)',
        fields: [
          { key: 'cloudmail_api_base', label: 'API Base', placeholder: 'https://cloudmail.example.com' },
          { key: 'cloudmail_admin_email', label: 'E-mail do admin (opcional)', placeholder: 'admin@example.com' },
          { key: 'cloudmail_admin_password', label: 'Senha do admin', secret: true },
          { key: 'cloudmail_domain', label: 'Domínio (opcional)', placeholder: 'mail.example.com,mail2.example.com' },
          { key: 'cloudmail_subdomain', label: 'Subdomínio (opcional)', placeholder: 'pool-a' },
          { key: 'cloudmail_timeout', label: 'Timeout da requisição (segundos)', placeholder: '30' },
        ],
      },
      {
        title: 'YYDS Mail / MaliAPI',
        desc: 'Cria e-mail temporário via API Key e faz polling da caixa de entrada',
        fields: [
          { key: 'maliapi_base_url', label: 'API URL', placeholder: 'https://maliapi.215.im/v1' },
          { key: 'maliapi_api_key', label: 'API Key', secret: true },
          { key: 'maliapi_domain', label: 'Domínio (opcional)', placeholder: 'example.com' },
          { key: 'maliapi_auto_domain_strategy', label: 'Estratégia de domínio automático', type: 'select' },
        ],
      },
      {
        title: 'Importar E-mail (Microsoft / Outlook / Hotmail)',
        desc: 'Usa pool de contas Microsoft importadas localmente, suporta Graph / IMAP (padrão Graph)',
        fields: [
          { key: 'outlook_backend', label: 'Método de recebimento Microsoft', type: 'select' },
        ],
      },
      {
        title: 'Importar E-mail (AppleMail)',
        desc: 'Lê arquivo de pool de e-mails local via refresh_token + client_id; suporta importação de JSON diretamente nesta página',
        fields: [
          { key: 'applemail_base_url', label: 'API URL', placeholder: 'https://www.appleemail.top' },
          { key: 'applemail_pool_dir', label: 'Diretório do pool', placeholder: 'mail' },
          { key: 'applemail_pool_file', label: 'Arquivo do pool atual (opcional)', placeholder: 'Vazio = lê o arquivo mais recente do diretório' },
          { key: 'applemail_mailboxes', label: 'Pastas para polling', placeholder: 'INBOX,Junk' },
        ],
      },
      {
        title: 'GPTMail',
        desc: 'Gera e-mail temporário via GPTMail API e faz polling; suporta domínios conhecidos para gerar endereços aleatórios localmente',
        fields: [
          { key: 'gptmail_base_url', label: 'API URL', placeholder: 'https://mail.chatgpt.org.uk' },
          { key: 'gptmail_api_key', label: 'API Key', secret: true, placeholder: 'gpt-test' },
          { key: 'gptmail_domain', label: 'Domínio (opcional)', placeholder: 'example.com' },
        ],
      },
      {
        title: 'OpenTrashMail',
        desc: 'Integra com serviço opentrashmail; faz polling via /json/<email> ou gera endereços aleatórios com domínio conhecido',
        fields: [
          { key: 'opentrashmail_api_url', label: 'API URL', placeholder: 'http://mail.example.com:8085' },
          { key: 'opentrashmail_domain', label: 'Domínio (opcional)', placeholder: 'xiyoufm.com' },
          { key: 'opentrashmail_password', label: 'Senha do site (opcional)', secret: true, placeholder: 'Preencher quando PASSWORD estiver ativado' },
        ],
      },
      {
        title: 'TempMail.lol',
        desc: 'Gera e-mail automaticamente, sem configuração, requer proxy de acesso',
        fields: [],
      },
      {
        title: 'DuckMail',
        desc: 'Gera e-mail automaticamente, cria conta aleatória',
        fields: [
          { key: 'duckmail_api_url', label: 'Web URL', placeholder: 'https://www.duckmail.sbs' },
          { key: 'duckmail_provider_url', label: 'Provider URL', placeholder: 'https://api.duckmail.sbs' },
          { key: 'duckmail_bearer', label: 'Bearer Token', placeholder: 'kevin273945', secret: true },
          { key: 'duckmail_domain', label: 'Domínio personalizado', placeholder: 'Vazio = deduzido do Provider URL' },
          { key: 'duckmail_api_key', label: 'API Key (domínio privado)', placeholder: 'dk_xxx (obtido em domain.duckmail.sbs)', secret: true },
        ],
      },
      {
        title: 'CF Worker (e-mail próprio)',
        desc: 'Serviço de e-mail temporário próprio baseado em Cloudflare Worker',
        fields: [
          { key: 'cfworker_api_url', label: 'API URL', placeholder: 'https://apimail.example.com' },
          { key: 'cfworker_admin_token', label: 'Token de Admin', secret: true },
          { key: 'cfworker_custom_auth', label: 'Senha do site', secret: true },
          { key: 'cfworker_subdomain', label: 'Subdomínio fixo', placeholder: 'mail / pool-a' },
          { key: 'email_domain_rule_enabled', label: 'Ativar regra de domínio', type: 'boolean' },
          { key: 'email_domain_level_count', label: 'Nível do domínio (N níveis)', placeholder: 'Ex: 2 / 3 / 4' },
          { key: 'cfworker_random_subdomain', label: 'Subdomínio aleatório', type: 'boolean' },
          { key: 'cfworker_random_name_subdomain', label: 'Subdomínio com nome aleatório', type: 'boolean' },
          { key: 'cfworker_fingerprint', label: 'Fingerprint', placeholder: '6703363b...' },
        ],
      },
      {
        title: 'LuckMail',
        desc: 'ChatGPT usa e-mail comprado, outras plataformas continuam com lógica de pedido de código',
        fields: [
          { key: 'luckmail_base_url', label: 'URL da plataforma', placeholder: 'https://mails.luckyous.com' },
          { key: 'luckmail_api_key', label: 'API Key', secret: true },
          { key: 'luckmail_email_type', label: 'Tipo de e-mail (opcional)', type: 'select' },
          { key: 'luckmail_domain', label: 'Domínio (opcional)', placeholder: 'outlook.com / gmail.com' },
        ],
      },
    ],
  },
  {
    key: 'captcha',
    label: 'CAPTCHA',
    icon: <SafetyOutlined />,
    sections: [
      {
        title: 'Serviço de CAPTCHA',
        desc: 'Usado para contornar verificação humana na página de registro',
        fields: [
          { key: 'default_captcha_solver', label: 'Serviço Padrão', type: 'select' },
          { key: 'yescaptcha_key', label: 'YesCaptcha Key', secret: true },
        ],
      },
    ],
  },
  {
    key: 'chatgpt',
    label: 'ChatGPT',
    icon: <ApiOutlined />,
    sections: [
      {
        title: 'Painel CPA',
        desc: 'Envia automaticamente para a plataforma CPA após registro',
        fields: [
          { key: 'cpa_enabled', label: 'Ativar envio automático', type: 'boolean' },
          { key: 'cpa_api_url', label: 'API URL', placeholder: 'https://your-cpa.example.com' },
          { key: 'cpa_api_key', label: 'API Key', secret: true },
        ],
      },
      {
        title: 'Painel Sub2API',
        desc: 'Envia automaticamente para o painel Sub2API após registro',
        fields: [
          { key: 'sub2api_enabled', label: 'Ativar envio automático', type: 'boolean' },
          { key: 'sub2api_api_url', label: 'API URL', placeholder: 'https://your-sub2api.example.com' },
          { key: 'sub2api_api_key', label: 'API Key', secret: true },
          { key: 'sub2api_group_ids', label: 'IDs de grupo', placeholder: 'Separar múltiplos por vírgula, ex: 2,4,8' },
        ],
      },
      {
        title: 'Manutenção automática CPA',
        desc: 'Remove credenciais com status=error periodicamente e registra novos ChatGPT quando abaixo do limite',
        fields: [
          { key: 'cpa_cleanup_enabled', label: 'Manutenção automática', type: 'select' },
          { key: 'cpa_cleanup_interval_minutes', label: 'Intervalo de verificação (minutos)', placeholder: '60' },
          { key: 'cpa_cleanup_threshold', label: 'Limite mínimo de credenciais', placeholder: '5' },
          { key: 'cpa_cleanup_concurrency', label: 'Registros simultâneos', placeholder: '1' },
          { key: 'cpa_cleanup_register_delay_seconds', label: 'Delay por registro (segundos)', placeholder: '0' },
        ],
      },
      {
        title: 'Team Manager',
        desc: 'Envia para sistema Team Manager próprio',
        fields: [
          { key: 'team_manager_url', label: 'API URL', placeholder: 'https://your-tm.example.com' },
          { key: 'team_manager_key', label: 'API Key', secret: true },
        ],
      },
      {
        title: 'CodexProxy',
        desc: 'Envia automaticamente para a plataforma CodexProxy após registro',
        fields: [
          { key: 'codex_proxy_url', label: 'API URL', placeholder: 'https://your-codex-proxy.example.com' },
          { key: 'codex_proxy_key', label: 'Admin Key', secret: true },
          { key: 'codex_proxy_upload_type', label: 'Tipo de envio' },
        ],
      },
      {
        title: 'SMSToMe - Verificação por telefone',
        desc: 'Obtém número e faz polling do código SMS automaticamente na fase add_phone do ChatGPT',
        fields: [
          { key: 'smstome_cookie', label: 'SMSToMe Cookie', secret: true },
          { key: 'smstome_country_slugs', label: 'Lista de países', placeholder: 'united-kingdom,poland' },
          { key: 'smstome_phone_attempts', label: 'Tentativas de número', placeholder: '3' },
          { key: 'smstome_otp_timeout_seconds', label: 'Tempo de espera pelo SMS (segundos)', placeholder: '45' },
          { key: 'smstome_poll_interval_seconds', label: 'Intervalo de polling (segundos)', placeholder: '5' },
          { key: 'smstome_sync_max_pages_per_country', label: 'Páginas de sync por país', placeholder: '5' },
        ],
      },
    ],
  },
  {
    key: 'cliproxyapi',
    label: 'CLIProxyAPI',
    icon: <ApiOutlined />,
    sections: [
      {
        title: 'Painel de Gerenciamento',
        desc: 'Usado para login na página de gerenciamento do CLIProxyAPI',
        fields: [
          { key: 'cliproxyapi_base_url', label: 'API URL', placeholder: 'http://127.0.0.1:8317' },
          { key: 'cliproxyapi_management_key', label: 'Chave de gerenciamento', secret: true, placeholder: 'padrão: cliproxyapi' },
        ],
      },
    ],
  },
  {
    key: 'grok',
    label: 'Grok',
    icon: <ApiOutlined />,
    sections: [
      {
        title: 'grok2api',
        desc: 'Importa automaticamente para o painel grok2api após registro',
        fields: [
          { key: 'grok2api_url', label: 'API URL', placeholder: 'http://127.0.0.1:7860' },
          { key: 'grok2api_app_key', label: 'App Key', secret: true },
          { key: 'grok2api_pool', label: 'Token Pool', placeholder: 'ssoBasic ou ssoSuper' },
          { key: 'grok2api_quota', label: 'Quota (opcional)', placeholder: 'Vazio = valor padrão do pool' },
        ],
      },
    ],
  },
  {
    key: 'kiro',
    label: 'Kiro',
    icon: <ApiOutlined />,
    sections: [
      {
        title: 'Kiro Account Manager',
        desc: 'Escreve automaticamente no accounts.json do kiro-account-manager após registro',
        fields: [
          {
            key: 'kiro_manager_path',
            label: 'Caminho do accounts.json (opcional)',
            placeholder: 'Vazio = usa o caminho padrão do sistema',
          },
          {
            key: 'kiro_manager_exe',
            label: 'Executável do Kiro Manager (opcional)',
            placeholder: 'Preencher com o KiroAccountManager.exe se Rust não estiver instalado',
          },
        ],
      },
    ],
  },
  {
    key: 'contribution',
    label: 'Contribuição',
    icon: <PlusOutlined />,
    sections: [],
  },
  {
    key: 'integrations',
    label: 'Plugins',
    icon: <ApiOutlined />,
    sections: [],
  },
  {
    key: 'security',
    label: 'Segurança',
    icon: <LockOutlined />,
    sections: [],
  },
]

interface FieldConfig {
  key: string
  label: string
  placeholder?: string
  type?: 'select' | 'input' | 'boolean'
  secret?: boolean
}

interface SectionConfig {
  title: string
  desc?: string
  fields: FieldConfig[]
}

interface TabConfig {
  key: string
  label: string
  icon: React.ReactNode
  sections: SectionConfig[]
}

const MAILBOX_SECTION_FIELD_KEY_BY_PROVIDER: Record<string, string> = {
  laoudo: 'laoudo_email',
  freemail: 'freemail_api_url',
  moemail: 'moemail_api_url',
  skymail: 'skymail_api_base',
  cloudmail: 'cloudmail_api_base',
  maliapi: 'maliapi_base_url',
  microsoft: 'outlook_backend',
  applemail: 'applemail_base_url',
  gptmail: 'gptmail_base_url',
  opentrashmail: 'opentrashmail_api_url',
  duckmail: 'duckmail_api_url',
  cfworker: 'cfworker_api_url',
  luckmail: 'luckmail_base_url',
}

const MAILBOX_SECTION_INDEX_BY_PROVIDER: Record<string, number> = {
  tempmail_lol: 10,
}

function splitMailboxSections(sections: SectionConfig[], mailProvider: string) {
  const defaultSection = sections[0] || null
  let selectedSection: SectionConfig | null = null

  const byIndex = MAILBOX_SECTION_INDEX_BY_PROVIDER[mailProvider]
  if (Number.isInteger(byIndex)) {
    selectedSection = sections[byIndex] || null
  } else {
    const fieldKey = MAILBOX_SECTION_FIELD_KEY_BY_PROVIDER[mailProvider]
    if (fieldKey) {
      selectedSection = sections.find((section) => section.fields.some((field) => field.key === fieldKey)) || null
    }
  }

  if (selectedSection === defaultSection) {
    selectedSection = null
  }

  const remainingSections = sections.filter((section) => section !== defaultSection && section !== selectedSection)

  return {
    defaultSection,
    selectedSection,
    remainingSections,
  }
}

function formatResultText(data: unknown) {
  if (typeof data === 'string') return data
  try {
    return JSON.stringify(data, null, 2)
  } catch {
    return String(data)
  }
}

function normalizeDomainList(input: unknown): string[] {
  const items = Array.isArray(input) ? input : []
  const seen = new Set<string>()
  const domains: string[] = []
  for (const item of items) {
    const domain = String(item || '').trim().toLowerCase().replace(/^@/, '')
    if (!domain || seen.has(domain)) continue
    seen.add(domain)
    domains.push(domain)
  }
  return domains
}

function parseStoredDomainList(value: unknown): string[] {
  if (Array.isArray(value)) return normalizeDomainList(value)
  if (typeof value !== 'string') return []

  const text = value.trim()
  if (!text) return []

  try {
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed)) {
      return normalizeDomainList(parsed)
    }
  } catch {}

  return normalizeDomainList(
    text
      .split('\n')
      .flatMap((line) => line.split(','))
      .map((item) => item.trim()),
  )
}

function resolveFeatureEnabledConfig(value: unknown, fallbackEnabled: boolean): boolean {
  const normalized = String(value ?? '').trim()
  if (!normalized) return fallbackEnabled
  return parseBooleanConfigValue(normalized)
}

const CONTRIBUTION_REDEEM_OPTIONS = [10, 100, 1000]

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function pickRecord(value: Record<string, unknown> | null, keys: string[]): Record<string, unknown> | null {
  if (!value) return null
  for (const key of keys) {
    const record = asRecord(value[key])
    if (record) return record
  }
  return null
}

function pickString(value: Record<string, unknown> | null, keys: string[]): string {
  if (!value) return ''
  for (const key of keys) {
    const text = String(value[key] ?? '').trim()
    if (text) return text
  }
  return ''
}

function pickNumber(value: Record<string, unknown> | null, keys: string[]): number | null {
  if (!value) return null
  for (const key of keys) {
    const raw = value[key]
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw
    if (typeof raw === 'string') {
      const parsed = Number.parseFloat(raw)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return null
}

function formatDisplayNumber(value: number | null, digits = 0): string {
  if (value === null || !Number.isFinite(value)) return '-'
  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

function formatDisplayPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '-'
  return `${value.toFixed(2)}%`
}

function ConfigField({ field }: { field: FieldConfig }) {
  const [showSecret, setShowSecret] = useState(false)
  const options = SELECT_FIELDS[field.key]
  const isBooleanField = field.type === 'boolean'
  const helpText =
    field.key === 'default_executor'
      ? 'Válido apenas para plataformas suportadas; ChatGPT, Cursor, Grok, Kiro, Tavily suportam modo navegador; OpenBlockLabs suporta apenas protocolo puro.'
      : field.key === 'email_domain_rule_enabled'
      ? 'Apenas CF Worker: quando ativado, valida o nível do domínio e exige pelo menos 2 letras e 2 números no domínio.'
      : field.key === 'email_domain_level_count'
      ? 'Ex: 2=example.com, 3=a.example.com, 4=a.b.example.com.'
      : undefined

  return (
    <Form.Item
      label={field.label}
      name={field.key}
      extra={helpText}
      valuePropName={isBooleanField ? 'checked' : undefined}
    >
      {options ? (
        <Select options={options} style={{ width: '100%' }} />
      ) : isBooleanField ? (
        <Switch checkedChildren="Ativado" unCheckedChildren="Desativado" />
      ) : field.secret ? (
        <Input.Password
          placeholder={field.placeholder}
          visibilityToggle={{
            visible: !showSecret,
            onVisibleChange: setShowSecret,
          }}
          iconRender={(visible) => (visible ? <EyeOutlined /> : <EyeInvisibleOutlined />)}
        />
      ) : (
        <Input placeholder={field.placeholder} />
      )}
    </Form.Item>
  )
}

function ConfigSection({ section }: { section: SectionConfig }) {
  return (
    <Card title={section.title} extra={section.desc && <span style={{ fontSize: 12, color: '#7a8ba3' }}>{section.desc}</span>} style={{ marginBottom: 16 }}>
      {section.fields.map((field) => (
        <ConfigField key={field.key} field={field} />
      ))}
    </Card>
  )
}

function CFWorkerDomainPoolSection({ form }: { form: any }) {
  const watchedDomains = Form.useWatch('cfworker_domains', form) || []
  const watchedEnabledDomains = Form.useWatch('cfworker_enabled_domains', form) || []
  const normalizedDomains = normalizeDomainList(watchedDomains)
  const enabledDomains = normalizeDomainList(watchedEnabledDomains).filter((domain) => normalizedDomains.includes(domain))

  const updateEnabledDomains = (nextDomains: string[]) => {
    form.setFieldValue('cfworker_enabled_domains', normalizeDomainList(nextDomains))
  }

  const toggleEnabledDomain = (domain: string, checked: boolean) => {
    if (checked) {
      updateEnabledDomains([...enabledDomains, domain])
      return
    }
    updateEnabledDomains(enabledDomains.filter((item) => item !== domain))
  }

  return (
    <Card
      title="CF Worker - Pool de domínios"
      extra={<span style={{ fontSize: 12, color: '#7a8ba3' }}>Um domínio habilitado será escolhido aleatoriamente no registro</span>}
      style={{ marginBottom: 16 }}
    >
      <Form.List name="cfworker_domains">
        {(fields, { add, remove }) => (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {fields.map((field) => {
              const { key, ...restField } = field
              return (
                <Space key={key} align="start" style={{ display: 'flex' }}>
                  <Form.Item
                    {...restField}
                    label={field.name === 0 ? 'Todos os domínios' : ''}
                    style={{ flex: 1, marginBottom: 0 }}
                    rules={[
                      {
                        validator: async (_, value) => {
                          if (!String(value || '').trim()) {
                            throw new Error('Insira um domínio')
                          }
                        },
                      },
                    ]}
                  >
                  <Input placeholder="example.com" />
                </Form.Item>
                <Button
                  danger
                  onClick={() => {
                    const currentDomains = Array.isArray(form.getFieldValue('cfworker_domains'))
                      ? [...form.getFieldValue('cfworker_domains')]
                      : []
                    const removedDomain = String(currentDomains[field.name] || '').trim().toLowerCase().replace(/^@/, '')
                    remove(field.name)
                    if (!removedDomain) return
                    const enabledDomains = normalizeDomainList(form.getFieldValue('cfworker_enabled_domains'))
                    form.setFieldValue(
                      'cfworker_enabled_domains',
                      enabledDomains.filter((domain) => domain !== removedDomain),
                    )
                  }}
                >
                  Remover
                </Button>
              </Space>
            )})}
            {fields.length === 0 ? (
              <Typography.Text type="secondary">Nenhum domínio configurado ainda. Adicione para selecionar abaixo.</Typography.Text>
            ) : null}
            <Button type="dashed" onClick={() => add('')} icon={<PlusOutlined />} block>
              Adicionar domínio
            </Button>
          </div>
        )}
      </Form.List>

      <Form.Item name="cfworker_enabled_domains" hidden>
        <Select mode="multiple" options={normalizedDomains.map((domain) => ({ label: domain, value: domain }))} />
      </Form.Item>

      <div style={{ marginTop: 16 }}>
        <div style={{ marginBottom: 8, fontWeight: 500 }}>Domínios habilitados</div>
        {enabledDomains.length > 0 ? (
          <Space wrap>
            {enabledDomains.map((domain) => (
              <Tag
                key={domain}
                color="blue"
                closable
                onClose={(event) => {
                  event.preventDefault()
                  updateEnabledDomains(enabledDomains.filter((item) => item !== domain))
                }}
              >
                {domain}
              </Tag>
            ))}
          </Space>
        ) : (
          <Typography.Text type="secondary">Nenhum domínio habilitado. Clique nos domínios abaixo para habilitar.</Typography.Text>
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={{ marginBottom: 8, fontWeight: 500 }}>Clique para alternar status</div>
        {normalizedDomains.length > 0 ? (
          <Space wrap>
            {normalizedDomains.map((domain) => (
              <Tag.CheckableTag
                key={domain}
                checked={enabledDomains.includes(domain)}
                onChange={(checked) => toggleEnabledDomain(domain, checked)}
              >
                {domain}
              </Tag.CheckableTag>
            ))}
          </Space>
        ) : (
          <Typography.Text type="secondary">Adicione domínios acima primeiro.</Typography.Text>
        )}
      </div>
      <Typography.Text type="secondary" style={{ display: 'block', marginTop: 12 }}>
        Somente domínios habilitados participam do registro; clique na tag habilitada para remover.
      </Typography.Text>
    </Card>
  )
}

function SolverStatus() {
  const [running, setRunning] = useState<boolean | null>(null)

  const checkSolver = async () => {
    try {
      const d = await apiFetch('/solver/status')
      setRunning(d.running)
    } catch {
      setRunning(false)
    }
  }

  const restartSolver = async () => {
    await apiFetch('/solver/restart', { method: 'POST' })
    setRunning(null)
    setTimeout(checkSolver, 2000)
  }

  useEffect(() => {
    checkSolver()
    const timer = window.setInterval(checkSolver, 5000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <Card title="Turnstile Solver" size="small" style={{ marginBottom: 16 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <Space size={8}>
          {running === null ? (
            <SyncOutlined spin style={{ color: '#7a8ba3' }} />
          ) : running ? (
            <CheckCircleOutlined style={{ color: '#10b981' }} />
          ) : (
            <CloseCircleOutlined style={{ color: '#ef4444' }} />
          )}
          <span style={{ color: running ? '#10b981' : '#7a8ba3', fontWeight: 500 }}>
            {running === null ? 'Verificando' : running ? 'Rodando' : 'Parado'}
          </span>
        </Space>
        <Button size="small" onClick={restartSolver}>
          Reiniciar Solver
        </Button>
      </div>
    </Card>
  )
}

function IntegrationsPanel() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState('')
  const [updateMode, setUpdateMode] = useState<'tag' | 'branch'>('tag')
  const saved = false
  const [resultModal, setResultModal] = useState({
    open: false,
    title: '',
    ok: true,
    content: '',
  })

  const showResultModal = (title: string, data: unknown, ok = true) => {
    setResultModal({
      open: true,
      title,
      ok,
      content: formatResultText(data),
    })
  }

  const load = async () => {
    setLoading(true)
    try {
      const [d, cfg] = await Promise.all([
        apiFetch('/integrations/services'),
        apiFetch('/config'),
      ])
      setItems(d.items || [])
      const mode = String(cfg?.external_apps_update_mode || 'tag').trim().toLowerCase()
      setUpdateMode(mode === 'branch' ? 'branch' : 'tag')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const timer = window.setInterval(load, 5000)
    return () => window.clearInterval(timer)
  }, [])

  const doAction = async (key: string, request: Promise<any>) => {
    setBusy(key)
    try {
      const result = await request
      await load()
      message.success('Operação concluída')
      showResultModal('Resultado da operação', result, true)
    } catch (e: any) {
      message.error(e?.message || 'Operação falhou')
      showResultModal('Resultado da operação', e?.message || e || 'Operação falhou', false)
      await load()
    } finally {
      setBusy('')
    }
  }

  const backfill = async (platforms: string[], label: string, busyKey: string) => {
    setBusy(busyKey)
    try {
      const d = await apiFetch('/integrations/backfill', {
        method: 'POST',
        body: JSON.stringify({ platforms }),
      })
      message.success(`${label} preenchimento concluído: sucesso ${d.success} / ${d.total}`)
      showResultModal(`${label} resultado do preenchimento`, d, true)
    } catch (e: any) {
      message.error(e?.message || `${label} preenchimento falhou`)
      showResultModal(`${label} resultado do preenchimento`, e?.message || e || `${label} preenchimento falhou`, false)
    } finally {
      setBusy('')
    }
  }

  const updateInstallMode = async (nextMode: 'tag' | 'branch') => {
    setBusy('update-mode')
    try {
      await apiFetch('/config', {
        method: 'PUT',
        body: JSON.stringify({ data: { external_apps_update_mode: nextMode } }),
      })
      setUpdateMode(nextMode)
      message.success(nextMode === 'tag' ? 'Modo tag ativado' : 'Modo branch ativado')
    } catch (e: any) {
      message.error(e?.message || 'Falha ao alternar modo')
    } finally {
      setBusy('')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {false ? (
        <div
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 24,
            transform: 'translateX(-50%)',
            zIndex: 1000,
            width: 'min(720px, calc(100vw - 32px))',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              width: '100%',
              padding: 0,
              borderRadius: 0,
              border: 'none',
              background: 'transparent',
              boxShadow: 'none',
              backdropFilter: 'none',
              pointerEvents: 'auto',
            }}
          >
            <Button type="primary" icon={<SaveOutlined />} onClick={() => {}} loading={false} block size="large">
              {saved ? 'Salvo ✓' : 'Salvar configuração'}
            </Button>
          </div>
        </div>
      ) : null}
      <Modal
        open={resultModal.open}
        title={resultModal.title}
        onCancel={() => setResultModal((v) => ({ ...v, open: false }))}
        onOk={() => setResultModal((v) => ({ ...v, open: false }))}
        okText="Confirmar"
        cancelText="Cancelar"
        width={760}
      >
        <Typography.Paragraph style={{ marginBottom: 8, color: resultModal.ok ? '#10b981' : '#ef4444' }}>
          {resultModal.ok ? 'Operação concluída.' : 'Operação falhou.'}
        </Typography.Paragraph>
        <pre
          style={{
            margin: 0,
            maxHeight: 420,
            overflow: 'auto',
            padding: 12,
            borderRadius: 8,
            background: 'rgba(127,127,127,0.08)',
            fontSize: 12,
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {resultModal.content}
        </pre>
      </Modal>

      <Card title="Estratégia de instalação/atualização">
        <Space wrap align="center">
          <Select
            style={{ width: 320 }}
            value={updateMode}
            options={SELECT_FIELDS.external_apps_update_mode}
            onChange={(value) => setUpdateMode(value as 'tag' | 'branch')}
          />
          <Button
            type="primary"
            loading={busy === 'update-mode'}
            onClick={() => updateInstallMode(updateMode)}
          >
            Salvar estratégia
          </Button>
        </Space>
      </Card>

      <Card title="Operações em lote">
        <Space wrap>
          <Button loading={busy === 'start-all'} onClick={() => doAction('start-all', apiFetch('/integrations/services/start-all', { method: 'POST' }))}>
            Iniciar todos (instalados)
          </Button>
          <Button loading={busy === 'stop-all'} onClick={() => doAction('stop-all', apiFetch('/integrations/services/stop-all', { method: 'POST' }))}>
            Parar todos
          </Button>
          <Button loading={loading} onClick={load}>
            Atualizar status
          </Button>
        </Space>
      </Card>

      {items.map((item) => (
        <Card key={item.name} title={item.label}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <div>
              Status:
              <Tag color={item.running ? 'green' : 'default'} style={{ marginLeft: 8 }}>
                {item.running ? 'Rodando' : 'Parado'}
              </Tag>
              <Tag color={item.repo_exists ? 'blue' : 'orange'} style={{ marginLeft: 8 }}>
                {item.repo_exists ? 'Instalado' : 'Não instalado'}
              </Tag>
              {item.pid ? <span style={{ marginLeft: 8 }}>PID: {item.pid}</span> : null}
            </div>
            <div>Diretório do plugin: <Typography.Text copyable>{item.repo_path}</Typography.Text></div>
            {item.url ? <div>Endereço: <Typography.Text copyable>{item.url}</Typography.Text></div> : null}
            {item.management_url ? <div>Página de gestão: <Typography.Text copyable>{item.management_url}</Typography.Text></div> : null}
            {item.management_key ? <div>Senha de acesso: <Typography.Text copyable>{item.management_key}</Typography.Text></div> : null}
            <div>Log: <Typography.Text copyable>{item.log_path}</Typography.Text></div>
            {item.last_error ? <div style={{ color: '#ef4444' }}>Último erro: {item.last_error}</div> : null}
            <Space wrap>
              {item.management_url ? (
                <Button onClick={() => window.open(item.management_url, '_blank')}>
                  Abrir gestão
                </Button>
              ) : null}
              {!item.repo_exists ? (
                <Button
                  type="primary"
                  loading={busy === `install-${item.name}`}
                  onClick={() => doAction(`install-${item.name}`, apiFetch(`/integrations/services/${item.name}/install`, { method: 'POST' }))}
                >
                  Instalar versão mais recente
                </Button>
              ) : (
                <Button
                  loading={busy === `install-${item.name}`}
                  onClick={() => doAction(`install-${item.name}`, apiFetch(`/integrations/services/${item.name}/install`, { method: 'POST' }))}
                >
                  Atualizar para versão mais recente
                </Button>
              )}
              <Button
                loading={busy === `start-${item.name}`}
                disabled={!item.repo_exists}
                onClick={() => doAction(`start-${item.name}`, apiFetch(`/integrations/services/${item.name}/start`, { method: 'POST' }))}
              >
                Iniciar
              </Button>
              <Button
                loading={busy === `stop-${item.name}`}
                onClick={() => doAction(`stop-${item.name}`, apiFetch(`/integrations/services/${item.name}/stop`, { method: 'POST' }))}
              >
                Parar
              </Button>
              <Button
                danger
                loading={busy === `uninstall-${item.name}`}
                disabled={!item.repo_exists}
                onClick={() => {
                  const ok = window.confirm(`Confirmar desinstalação de ${item.label}?\nO serviço será parado e o diretório local do plugin será removido.`)
                  if (!ok) return
                  doAction(
                    `uninstall-${item.name}`,
                    apiFetch(`/integrations/services/${item.name}/uninstall`, { method: 'POST' }),
                  )
                }}
              >
                Desinstalar
              </Button>
              {item.name === 'grok2api' ? (
                <Button
                  loading={busy === 'backfill-grok'}
                  onClick={() => backfill(['grok'], 'Grok', 'backfill-grok')}
                >
                  Preencher contas Grok existentes
                </Button>
              ) : null}
              {item.name === 'kiro-manager' ? (
                <Button
                  loading={busy === 'backfill-kiro'}
                  onClick={() => backfill(['kiro'], 'Kiro', 'backfill-kiro')}
                >
                  Preencher contas Kiro existentes
                </Button>
              ) : null}
            </Space>
          </Space>
        </Card>
      ))}
    </div>
  )
}

function ContributionPanel({
  form,
  onSave,
  saving,
  saved,
}: {
  form: any
  onSave: () => Promise<void>
  saving: boolean
  saved: boolean
}) {
  const [loadingStats, setLoadingStats] = useState(false)
  const [redeeming, setRedeeming] = useState(false)
  const [creatingKey, setCreatingKey] = useState(false)
  const [redeemAmount, setRedeemAmount] = useState<number>(CONTRIBUTION_REDEEM_OPTIONS[0])
  const [statsResponse, setStatsResponse] = useState<Record<string, unknown> | null>(null)
  const [redeemResponse, setRedeemResponse] = useState<Record<string, unknown> | null>(null)
  const [statsError, setStatsError] = useState('')
  const [bindingCustom, setBindingCustom] = useState(false)
  const [customEmail, setCustomEmail] = useState('')
  const [customStatsResponse, setCustomStatsResponse] = useState<Record<string, unknown> | null>(null)
  const [customBalanceResponse, setCustomBalanceResponse] = useState<Record<string, unknown> | null>(null)
  const [loadingCustomStats, setLoadingCustomStats] = useState(false)

  const contributionEnabled = Form.useWatch('contribution_enabled', form)
  const contributionMode = String(Form.useWatch('contribution_mode', form) || 'codex').trim()
  const contributionServerUrl = String(Form.useWatch('contribution_server_url', form) || '').trim()
  const contributionKey = String(Form.useWatch('contribution_key', form) || '').trim()
  const customContributionUrl = String(Form.useWatch('custom_contribution_url', form) || '').trim()
  const customContributionToken = String(Form.useWatch('custom_contribution_token', form) || '').trim()

  const isCustomMode = contributionMode === 'custom'

  const rawData = asRecord(statsResponse?.['data'])
  const serverInfo = pickRecord(rawData, ['server_info', 'server', 'server_stats', 'stats']) || rawData
  const keyInfo = pickRecord(rawData, ['key_info', 'keyInfo', 'public_key_info', 'quota']) || rawData

  const keyFromStats = pickString(keyInfo, ['key', 'public_key', 'api_key']) || contributionKey
  const keyBalance =
    pickNumber(keyInfo, ['balance_usd', 'balance', 'current_balance', 'remaining_balance_usd']) ??
    pickNumber(rawData, ['balance_usd', 'balance', 'current_balance'])
  const keySource = pickString(keyInfo, ['source', 'key_source', 'origin']) || '-'
  const boundAccounts =
    pickNumber(keyInfo, ['bound_account_count', 'bind_account_count', 'bound_accounts', 'account_count']) ??
    (Array.isArray(keyInfo?.['accounts']) ? keyInfo['accounts'].length : null)
  const settlementAmount =
    pickNumber(keyInfo, ['settlement_amount_usd', 'settlement_amount', 'settled_amount_usd']) ??
    pickNumber(rawData, ['settlement_amount_usd', 'settlement_amount'])
  const serverQuotaAccountCount = pickNumber(serverInfo, ['quota_account_count'])
  const serverQuotaTotal = pickNumber(serverInfo, ['quota_total'])
  const serverQuotaUsed = pickNumber(serverInfo, ['quota_used'])
  const serverQuotaRemaining = pickNumber(serverInfo, ['quota_remaining'])
  const serverQuotaUsedPercent = pickNumber(serverInfo, ['quota_used_percent'])
  const serverQuotaRemainingPercent = pickNumber(serverInfo, ['quota_remaining_percent'])
  const serverQuotaRemainingAccounts = pickNumber(serverInfo, ['quota_remaining_accounts'])
  const redeemData = asRecord(redeemResponse?.['data']) || asRecord(redeemResponse)
  const redeemCode = pickString(redeemData, ['code', 'redeem_code', 'voucher_code'])
  const redeemedAmountUSD = pickNumber(redeemData, ['redeemed_amount_usd', 'redeemed_amount', 'amount_usd'])
  const redeemSuccessText =
    redeemResponse
      ? `Saque realizado! Valor: ${redeemedAmountUSD !== null ? formatDisplayNumber(redeemedAmountUSD, 2) : '-'} Código: ${redeemCode || '-'}`
      : ''

  const fetchStats = async (silent = false, keyOverride?: string) => {
    if (!contributionEnabled) {
      if (!silent) message.warning('Habilite a função de contribuição primeiro')
      return
    }
    if (!contributionServerUrl) {
      if (!silent) message.error('Preencha o endereço do servidor primeiro')
      return
    }

    setLoadingStats(true)
    setStatsError('')
    try {
      const data = await apiFetch('/contribution/quota-stats', {
        method: 'POST',
        body: JSON.stringify({
          server_url: contributionServerUrl,
          key: keyOverride ?? contributionKey,
        }),
      })
      setStatsResponse(asRecord(data))
      if (!silent) {
        message.success('Informações de cota atualizadas')
      }
    } catch (e: any) {
      const detail = String(e?.message || 'Falha ao obter informações de cota')
      setStatsError(detail)
      if (!silent) {
        message.error(detail)
      }
    } finally {
      setLoadingStats(false)
    }
  }

  const doRedeem = async () => {
    if (!contributionEnabled) {
      message.warning('Habilite a função de contribuição primeiro')
      return
    }
    if (!contributionServerUrl) {
      message.error('Preencha o endereço do servidor primeiro')
      return
    }
    if (!contributionKey) {
      message.error('Preencha a API Key primeiro')
      return
    }

    const confirmed = window.confirm(`Confirmar saque?\nSolicitar saque no valor de ${redeemAmount}`)
    if (!confirmed) return

    setRedeeming(true)
    try {
      const data = await apiFetch('/contribution/redeem', {
        method: 'POST',
        body: JSON.stringify({
          server_url: contributionServerUrl,
          key: contributionKey,
          amount_usd: redeemAmount,
        }),
      })
      const result = asRecord(data)
      const payload = asRecord(result?.['data']) || result
      const code = pickString(payload, ['code', 'redeem_code', 'voucher_code'])
      const amount = pickNumber(payload, ['redeemed_amount_usd', 'redeemed_amount', 'amount_usd'])
      setRedeemResponse(result)
      if (amount !== null || code) {
        message.success(`Saque realizado! Valor: ${amount !== null ? formatDisplayNumber(amount, 2) : '-'} Código: ${code || '-'}`)
      } else {
        message.success('Saque realizado com sucesso')
      }
      await fetchStats(true)
    } catch (e: any) {
      const detail = String(e?.message || 'Falha ao realizar saque')
      setRedeemResponse({ ok: false, error: detail })
      message.error(detail)
    } finally {
      setRedeeming(false)
    }
  }

  const doGenerateKey = async () => {
    if (!contributionServerUrl) {
      message.error('Preencha o endereço do servidor primeiro')
      return
    }
    setCreatingKey(true)
    try {
      const result = await apiFetch('/contribution/generate-key', {
        method: 'POST',
        body: JSON.stringify({
          server_url: contributionServerUrl,
        }),
      })
      const payload = asRecord(asRecord(result)?.data)
      const generated = pickString(payload, ['key', 'api_key', 'public_key'])
      if (!generated) {
        throw new Error('Servidor não retornou uma key válida')
      }
      form.setFieldValue('contribution_key', generated)
      message.success('API Key criada e preenchida. Clique em salvar configuração.')
      if (contributionEnabled) {
        await fetchStats(true, generated)
      }
    } catch (e: any) {
      message.error(String(e?.message || 'Falha ao solicitar nova key'))
    } finally {
      setCreatingKey(false)
    }
  }

  const doBindCustom = async () => {
    if (!customEmail.trim()) {
      message.error('Insira um e-mail')
      return
    }
    if (!customContributionUrl) {
      message.error('Preencha o endereço do servidor personalizado primeiro')
      return
    }
    setBindingCustom(true)
    try {
      const data = await apiFetch('/contribution/custom/bind', {
        method: 'POST',
        body: JSON.stringify({
          email: customEmail.trim(),
          server_url: customContributionUrl,
        }),
      })
      const token = pickString(asRecord(data), ['token'])
      if (token) {
        form.setFieldValue('custom_contribution_token', token)
        message.success('Vinculado com sucesso! Token preenchido automaticamente. Clique em salvar.')
        setCustomEmail('')
      } else {
        message.success('Vinculado com sucesso')
      }
    } catch (e: any) {
      message.error(String(e?.message || 'Falha ao vincular'))
    } finally {
      setBindingCustom(false)
    }
  }

  const fetchCustomStats = async () => {
    if (!contributionEnabled) {
      message.warning('Habilite a função de contribuição primeiro')
      return
    }
    if (!customContributionUrl) {
      message.error('Preencha o endereço do servidor personalizado primeiro')
      return
    }
    if (!customContributionToken) {
      message.error('Vincule seu e-mail para obter o token primeiro')
      return
    }
    setLoadingCustomStats(true)
    try {
      const [status, balance] = await Promise.all([
        apiFetch(`/contribution/custom/status?server_url=${encodeURIComponent(customContributionUrl)}&token=${encodeURIComponent(customContributionToken)}`),
        apiFetch(`/contribution/custom/balance?server_url=${encodeURIComponent(customContributionUrl)}&token=${encodeURIComponent(customContributionToken)}`),
      ])
      setCustomStatsResponse(asRecord(status))
      setCustomBalanceResponse(asRecord(balance))
      message.success('Informações atualizadas')
    } catch (e: any) {
      message.error(String(e?.message || 'Falha ao obter informações'))
    } finally {
      setLoadingCustomStats(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card title="Configuração">
        <Alert
          type="warning"
          showIcon
          banner
          style={{ marginBottom: 12 }}
          message="Com o modo contribuição ativo, contas registradas serão enviadas somente para o servidor de contribuição"
          description={(
            <>
              <div>Upload automático para CPA / CodexProxy / Sub2API será desativado para evitar duplicatas.</div>
              <div>Esta função está em teste no relay xem. Entre no grupo para saber mais.</div>
              <div>Relay: https://ai.xem8k5.top/ Grupo: 634758974</div>
            </>
          )}
        />
        <Form.Item name="contribution_enabled" label="Ativar" valuePropName="checked">
          <Switch checkedChildren="Ativado" unCheckedChildren="Desativado" />
        </Form.Item>
        <Form.Item name="contribution_mode" label="Modo de contribuição">
          <Select>
            <Select.Option value="codex">Codex2API (relay xem)</Select.Option>
            <Select.Option value="custom">Sistema de contribuição personalizado</Select.Option>
          </Select>
        </Form.Item>

        {!isCustomMode ? (
          <>
            <Form.Item
              name="contribution_server_url"
              label="Endereço do servidor"
              rules={[{ required: true, message: 'Insira o endereço do servidor' }]}
            >
              <Input placeholder="http://new.xem8k5.top:7317/" />
            </Form.Item>
            <Form.Item name="contribution_key" label="API Key">
              <Input
                placeholder="Deixe em branco e clique no botão à direita para criar automaticamente"
                addonAfter={(
                  <Button
                    type="link"
                    size="small"
                    loading={creatingKey}
                    onClick={() => { void doGenerateKey() }}
                    style={{ paddingInline: 0 }}
                  >
                    Sem key? Criar nova
                  </Button>
                )}
              />
            </Form.Item>
          </>
        ) : (
          <>
            <Form.Item
              name="custom_contribution_url"
              label="Endereço do servidor personalizado"
              rules={[{ required: true, message: 'Insira o endereço do servidor' }]}
            >
              <Input placeholder="http://127.0.0.1:5000" />
            </Form.Item>
            <Form.Item label="Vincular e-mail">
              <Space.Compact style={{ width: '100%' }}>
                <Input
                  placeholder="Insira o e-mail para vincular à conta"
                  value={customEmail}
                  onChange={(e) => setCustomEmail(e.target.value)}
                  onPressEnter={() => { void doBindCustom() }}
                />
                <Button type="primary" loading={bindingCustom} onClick={() => { void doBindCustom() }}>
                  Vincular
                </Button>
              </Space.Compact>
            </Form.Item>
            <Form.Item name="custom_contribution_token" label="Token">
              <Input.TextArea placeholder="Preenchido automaticamente após vincular o e-mail" rows={3} />
            </Form.Item>
          </>
        )}

        <Button type="primary" icon={<SaveOutlined />} onClick={onSave} loading={saving} block>
          {saved ? 'Salvo ✓' : 'Salvar configuração'}
        </Button>
      </Card>

      {!isCustomMode ? (
        <>
          <Card
            title="Informações"
            extra={(
              <Button loading={loadingStats} onClick={() => { void fetchStats() }}>
                Atualizar informações
              </Button>
            )}
          >
            {!contributionEnabled ? (
              <Alert type="info" showIcon message="Contribuição desabilitada. Habilite para ver informações do servidor e key." />
            ) : (
              <Space direction="vertical" style={{ width: '100%' }} size={12}>
                {statsError ? <Alert type="error" showIcon message={statsError} /> : null}
                <div>
                  <Typography.Text strong>Informações do servidor</Typography.Text>
                  <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
                    <Tag color="blue">Contas: {formatDisplayNumber(serverQuotaAccountCount)}</Tag>
                    <Tag color="geekblue">Cota total: {formatDisplayNumber(serverQuotaTotal)}</Tag>
                    <Tag color="volcano">Cota usada: {formatDisplayNumber(serverQuotaUsed)}</Tag>
                    <Tag color="green">Cota restante: {formatDisplayNumber(serverQuotaRemaining)}</Tag>
                    <Tag color="orange">% usada: {formatDisplayPercent(serverQuotaUsedPercent)}</Tag>
                    <Tag color="cyan">% restante: {formatDisplayPercent(serverQuotaRemainingPercent)}</Tag>
                    <Tag color="purple">Contas restantes equivalentes: {formatDisplayNumber(serverQuotaRemainingAccounts, 2)}</Tag>
                  </div>
                </div>
                <div>
                  <Typography.Text strong>API Key</Typography.Text>
                  <Space style={{ marginLeft: 8 }}>
                    <Typography.Text copyable={keyFromStats ? { text: keyFromStats } : undefined}>
                      {keyFromStats || '-'}
                    </Typography.Text>
                  </Space>
                </div>
                <div>
                  <Typography.Text strong>Detalhes da key</Typography.Text>
                  <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
                    <Tag color="blue">Saldo: {keyBalance ?? '-'}</Tag>
                    <Tag color="geekblue">Origem: {keySource}</Tag>
                    <Tag color="cyan">Contas vinculadas: {boundAccounts ?? '-'}</Tag>
                    <Tag color="purple">Valor liquidado: {settlementAmount ?? '-'}</Tag>
                  </div>
                </div>
              </Space>
            )}
          </Card>

          <Card title="Saque">
            <Space direction="vertical" style={{ width: '100%' }}>
              <Typography.Text>Cota atual da key: {keyBalance ?? '-'}</Typography.Text>
              <Form.Item label="Valor do saque" style={{ marginBottom: 0 }}>
                <Select
                  value={redeemAmount}
                  onChange={setRedeemAmount}
                  style={{ width: 240 }}
                  options={CONTRIBUTION_REDEEM_OPTIONS.map((amount) => ({ label: String(amount), value: amount }))}
                />
              </Form.Item>
              <Button type="primary" danger onClick={() => { void doRedeem() }} loading={redeeming}>
                Confirmar saque
              </Button>
              {redeemResponse ? (
                <Alert
                  type={redeemResponse.ok === false ? 'error' : 'success'}
                  showIcon
                  message={redeemResponse.ok === false ? `Falha no saque: ${String(redeemResponse.error || '-')}` : redeemSuccessText}
                  description={<pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{formatResultText(redeemResponse)}</pre>}
                />
              ) : null}
            </Space>
          </Card>
        </>
      ) : (
        <Card
          title="Informações"
          extra={(
            <Button loading={loadingCustomStats} onClick={() => { void fetchCustomStats() }}>
              Atualizar informações
            </Button>
          )}
        >
          {!contributionEnabled ? (
            <Alert type="info" showIcon message="Contribuição desabilitada. Habilite para ver informações." />
          ) : !customContributionToken ? (
            <Alert type="warning" showIcon message="Vincule seu e-mail para obter o token primeiro" />
          ) : (
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <div>
                <Typography.Text strong>Saldo</Typography.Text>
                <div style={{ marginTop: 8 }}>
                  <Tag color="blue">Saldo: {pickNumber(asRecord(customBalanceResponse), ['balance']) ?? '-'}</Tag>
                </div>
              </div>
              <div>
                <Typography.Text strong>Histórico de contribuição</Typography.Text>
                <div style={{ marginTop: 8 }}>
                  <Tag color="green">Sucesso: {pickNumber(asRecord(customStatsResponse), ['success_count']) ?? '-'}</Tag>
                  <Tag color="orange">Pendente: {pickNumber(asRecord(customStatsResponse), ['pending_count']) ?? '-'}</Tag>
                  <Tag color="red">Falha: {pickNumber(asRecord(customStatsResponse), ['failed_count']) ?? '-'}</Tag>
                </div>
              </div>
            </Space>
          )}
        </Card>
      )}
    </div>
  )
}

type TotpSetupState = 'idle' | 'setup'

function SecurityPanel() {
  const { message: msg } = App.useApp()
  const [status, setStatus] = useState<{ has_password: boolean; has_totp: boolean } | null>(null)
  const [loading, setLoading] = useState(false)

  const [enableForm] = Form.useForm()
  const [pwForm] = Form.useForm()
  const [codeForm] = Form.useForm()

  const [totpSetupState, setTotpSetupState] = useState<TotpSetupState>('idle')
  const [totpSecret, setTotpSecret] = useState('')
  const [totpUri, setTotpUri] = useState('')

  const loadStatus = async () => {
    try {
      const s = await apiFetch('/auth/status')
      setStatus(s)
    } catch {}
  }

  useEffect(() => { loadStatus() }, [])

  const handleEnable = async (values: { password: string; confirm: string }) => {
    if (values.password !== values.confirm) {
      msg.error('As senhas não coincidem')
      return
    }
    setLoading(true)
    try {
      const d = await apiFetch('/auth/setup', {
        method: 'POST',
        body: JSON.stringify({ password: values.password }),
      })
      localStorage.setItem('auth_token', d.access_token)
      msg.success('Proteção por senha habilitada')
      enableForm.resetFields()
      await loadStatus()
    } catch (e: any) {
      msg.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDisableAuth = async () => {
    setLoading(true)
    try {
      await apiFetch('/auth/disable', { method: 'POST' })
      localStorage.removeItem('auth_token')
      msg.success('Proteção por senha desabilitada')
      await loadStatus()
    } catch (e: any) {
      msg.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleChangePassword = async (values: { current_password: string; new_password: string; confirm: string }) => {
    if (values.new_password !== values.confirm) {
      msg.error('As novas senhas não coincidem')
      return
    }
    setLoading(true)
    try {
      await apiFetch('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ current_password: values.current_password, new_password: values.new_password }),
      })
      msg.success('Senha atualizada')
      pwForm.resetFields()
    } catch (e: any) {
      msg.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSetupTotp = async () => {
    setLoading(true)
    try {
      const d = await apiFetch('/auth/2fa/setup')
      setTotpSecret(d.secret)
      setTotpUri(d.uri)
      setTotpSetupState('setup')
    } catch (e: any) {
      msg.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleEnableTotp = async (values: { code: string }) => {
    setLoading(true)
    try {
      await apiFetch('/auth/2fa/enable', {
        method: 'POST',
        body: JSON.stringify({ secret: totpSecret, code: values.code }),
      })
      msg.success('Autenticação de dois fatores habilitada')
      setTotpSetupState('idle')
      codeForm.resetFields()
      await loadStatus()
    } catch (e: any) {
      msg.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDisableTotp = async () => {
    setLoading(true)
    try {
      await apiFetch('/auth/2fa/disable', { method: 'POST' })
      msg.success('Autenticação de dois fatores desabilitada')
      await loadStatus()
    } catch (e: any) {
      msg.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card
        title="Proteção por senha de acesso"
        extra={
          status?.has_password
            ? <Tag color="green"><CheckCircleOutlined /> Habilitado</Tag>
            : <Tag color="default"><CloseCircleOutlined /> Não habilitado</Tag>
        }
      >
        {!status?.has_password ? (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Typography.Text type="secondary">
              Quando habilitado, o acesso ao painel requer uma senha. Por padrão, qualquer pessoa com acesso ao endereço pode usar.
            </Typography.Text>
            <Form form={enableForm} layout="vertical" onFinish={handleEnable} requiredMark={false} style={{ maxWidth: 360, marginTop: 8 }}>
              <Form.Item name="password" label="Definir senha de acesso" rules={[{ required: true, message: 'Insira a senha' }, { min: 6, message: 'Mínimo 6 caracteres' }]}>
                <Input.Password placeholder="Mínimo 6 caracteres" />
              </Form.Item>
              <Form.Item name="confirm" label="Confirmar senha" rules={[{ required: true, message: 'Insira novamente' }]}>
                <Input.Password placeholder="Digite a senha novamente" />
              </Form.Item>
              <Form.Item style={{ marginBottom: 0 }}>
                <Button type="primary" htmlType="submit" loading={loading} icon={<LockOutlined />}>
                  Habilitar proteção por senha
                </Button>
              </Form.Item>
            </Form>
          </Space>
        ) : (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Typography.Text type="secondary">Proteção por senha habilitada. Ao desabilitar, qualquer pessoa poderá acessar sem senha.</Typography.Text>
            <Button danger loading={loading} onClick={handleDisableAuth}>
              Desabilitar proteção por senha
            </Button>
          </Space>
        )}
      </Card>

      {status?.has_password && (
        <>
          <Card title="Alterar senha">
            <Form form={pwForm} layout="vertical" onFinish={handleChangePassword} requiredMark={false} style={{ maxWidth: 360 }}>
              <Form.Item name="current_password" label="Senha atual" rules={[{ required: true, message: 'Insira a senha atual' }]}>
                <Input.Password placeholder="Senha atual" />
              </Form.Item>
              <Form.Item name="new_password" label="Nova senha" rules={[{ required: true, message: 'Insira a nova senha' }, { min: 6, message: 'Mínimo 6 caracteres' }]}>
                <Input.Password placeholder="Nova senha (mínimo 6 caracteres)" />
              </Form.Item>
              <Form.Item name="confirm" label="Confirmar nova senha" rules={[{ required: true, message: 'Insira novamente' }]}>
                <Input.Password placeholder="Digite a nova senha novamente" />
              </Form.Item>
              <Form.Item style={{ marginBottom: 0 }}>
                <Button type="primary" htmlType="submit" loading={loading} icon={<SaveOutlined />}>
                  Atualizar senha
                </Button>
              </Form.Item>
            </Form>
          </Card>

          <Card
            title="Autenticação de dois fatores (2FA)"
            extra={
              status?.has_totp
                ? <Tag color="green"><CheckCircleOutlined /> Habilitado</Tag>
                : <Tag color="default"><CloseCircleOutlined /> Não habilitado</Tag>
            }
          >
            {status?.has_totp ? (
              <Space direction="vertical">
                <Typography.Text type="secondary">
                  No login, além da senha, é necessário inserir o código de 6 dígitos do Google Authenticator / Authy ou app similar.
                </Typography.Text>
                <Button danger loading={loading} onClick={handleDisableTotp}>
                  Desabilitar autenticação de dois fatores
                </Button>
              </Space>
            ) : totpSetupState === 'idle' ? (
              <Space direction="vertical">
                <Typography.Text type="secondary">
                  Quando habilitado, além da senha, o login exige um código de 6 dígitos do app autenticador, aumentando muito a segurança.
                </Typography.Text>
                <Button type="primary" loading={loading} onClick={handleSetupTotp} icon={<SafetyOutlined />}>
                  Habilitar autenticação de dois fatores
                </Button>
              </Space>
            ) : (
              <Space direction="vertical" style={{ width: '100%' }}>
                <Typography.Text strong>1. Escaneie o QR code abaixo com o app autenticador</Typography.Text>
                <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <QRCode value={totpUri} size={180} />
                  <div style={{ flex: 1 }}>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>Não consegue escanear? Insira a chave manualmente:</Typography.Text>
                    <Typography.Paragraph copyable style={{ fontFamily: 'monospace', fontSize: 13, marginTop: 4 }}>
                      {totpSecret}
                    </Typography.Paragraph>
                  </div>
                </div>
                <Typography.Text strong>2. Insira o código de 6 dígitos exibido no app para confirmar</Typography.Text>
                <Form form={codeForm} layout="inline" onFinish={handleEnableTotp}>
                  <Form.Item name="code" rules={[{ required: true, message: 'Insira o código' }, { len: 6, message: '6 dígitos' }]}>
                    <Input placeholder="000000" maxLength={6} style={{ width: 140, letterSpacing: 4, textAlign: 'center' }} />
                  </Form.Item>
                  <Form.Item>
                    <Button type="primary" htmlType="submit" loading={loading}>Confirmar ativação</Button>
                  </Form.Item>
                  <Form.Item>
                    <Button onClick={() => setTotpSetupState('idle')}>Cancelar</Button>
                  </Form.Item>
                </Form>
              </Space>
            )}
          </Card>
        </>
      )}
    </div>
  )
}

export default function Settings() {
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [activeTab, setActiveTab] = useState('register')
  const currentMailProviderRaw = String(Form.useWatch('mail_provider', form) || '')
  const currentMailImportSource = String(Form.useWatch('mail_import_source', form) || 'microsoft')
  const currentMailProvider = resolveEffectiveMailProvider(currentMailProviderRaw, currentMailImportSource)
  const showFloatingSaveButton = activeTab === 'mailbox' || activeTab === 'chatgpt'
  const contentPaneRef = useRef<HTMLDivElement | null>(null)
  const [floatingSaveBounds, setFloatingSaveBounds] = useState<{ left: number; width: number } | null>(null)

  useEffect(() => {
    apiFetch('/config').then((data) => {
      const configMailProvider = String(data.mail_provider || 'luckmail')
      const isMailImportProvider = configMailProvider === 'microsoft' || configMailProvider === 'outlook' || configMailProvider === 'applemail'
      if (!data.mail_provider) {
        data.mail_provider = 'luckmail'
      }
      if (!data.applemail_base_url) {
        data.applemail_base_url = 'https://www.appleemail.top'
      }
      if (!data.applemail_pool_dir) {
        data.applemail_pool_dir = 'mail'
      }
      if (!data.applemail_mailboxes) {
        data.applemail_mailboxes = 'INBOX,Junk'
      }
      if (!data.outlook_backend) {
        data.outlook_backend = 'graph'
      }
      if (!data.gptmail_base_url) {
        data.gptmail_base_url = 'https://mail.chatgpt.org.uk'
      }
      if (!data.maliapi_base_url) {
        data.maliapi_base_url = 'https://maliapi.215.im/v1'
      }
      if (!data.luckmail_base_url) {
        data.luckmail_base_url = 'https://mails.luckyous.com/'
      }
      if (!String(data.contribution_enabled ?? '').trim()) {
        data.contribution_enabled = false
      }
      if (!data.contribution_server_url) {
        data.contribution_server_url = 'http://new.xem8k5.top:7317/'
      }
      if (!data.contribution_mode) {
        data.contribution_mode = 'codex'
      }
      if (!data.custom_contribution_url) {
        data.custom_contribution_url = 'http://127.0.0.1:5000'
      }
      if (!data.cloudmail_timeout) {
        data.cloudmail_timeout = 30
      }
      data.cpa_enabled = resolveFeatureEnabledConfig(
        data.cpa_enabled,
        Boolean(String(data.cpa_api_url ?? '').trim()),
      )
      data.sub2api_enabled = resolveFeatureEnabledConfig(
        data.sub2api_enabled,
        Boolean(String(data.sub2api_api_url ?? '').trim() && String(data.sub2api_api_key ?? '').trim()),
      )
      data.cfworker_domains = parseStoredDomainList(data.cfworker_domains)
      data.cfworker_enabled_domains = parseStoredDomainList(data.cfworker_enabled_domains)
      data.cfworker_random_subdomain = parseBooleanConfigValue(data.cfworker_random_subdomain)
      data.cfworker_random_name_subdomain = parseBooleanConfigValue(data.cfworker_random_name_subdomain)
      data.contribution_enabled = parseBooleanConfigValue(data.contribution_enabled)
      data.email_domain_rule_enabled = parseBooleanConfigValue(data.email_domain_rule_enabled)
      if (!String(data.email_domain_level_count ?? '').trim()) {
        data.email_domain_level_count = 2
      }
      data.mail_import_source = configMailProvider === 'applemail' ? 'applemail' : 'microsoft'
      data.mail_provider = isMailImportProvider ? 'mail_import' : configMailProvider
      form.setFieldsValue(data)
    })
  }, [form])

  useEffect(() => {
    if (!showFloatingSaveButton) {
      setFloatingSaveBounds(null)
      return
    }

    const element = contentPaneRef.current
    if (!element) return

    const updateBounds = () => {
      const rect = element.getBoundingClientRect()
      setFloatingSaveBounds({
        left: rect.left,
        width: rect.width,
      })
    }

    updateBounds()

    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => updateBounds())
        : null

    observer?.observe(element)
    window.addEventListener('resize', updateBounds)

    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', updateBounds)
    }
  }, [showFloatingSaveButton, activeTab])

  const save = async () => {
    setSaving(true)
    try {
      const values = form.getFieldsValue(true)
      values.mail_provider = resolveEffectiveMailProvider(values.mail_provider, values.mail_import_source)
      delete values.mail_import_source
      const domains = normalizeDomainList(values.cfworker_domains)
      const enabledDomains = normalizeDomainList(values.cfworker_enabled_domains).filter((domain) => domains.includes(domain))

      if (domains.length > 0 && enabledDomains.length === 0) {
        setActiveTab('mailbox')
        message.error('CF Worker requer pelo menos um domínio habilitado')
        return
      }

      values.cfworker_domains = JSON.stringify(domains)
      values.cfworker_enabled_domains = JSON.stringify(enabledDomains)
      if (domains.length > 0) {
        values.cfworker_domain = ''
      }
      values.cpa_enabled = parseBooleanConfigValue(values.cpa_enabled)
      values.sub2api_enabled = parseBooleanConfigValue(values.sub2api_enabled)
      values.cfworker_random_subdomain = parseBooleanConfigValue(values.cfworker_random_subdomain)
      values.cfworker_random_name_subdomain = parseBooleanConfigValue(values.cfworker_random_name_subdomain)
      values.contribution_enabled = parseBooleanConfigValue(values.contribution_enabled)
      values.email_domain_rule_enabled = parseBooleanConfigValue(values.email_domain_rule_enabled)
      const rawDomainLevelCount = Number.parseInt(String(values.email_domain_level_count ?? '').trim(), 10)
      if (values.mail_provider === 'cfworker' && values.email_domain_rule_enabled) {
        if (!Number.isInteger(rawDomainLevelCount) || rawDomainLevelCount < 2) {
          setActiveTab('mailbox')
          message.error('O nível de domínio deve ser um inteiro maior ou igual a 2')
          return
        }
      }
      values.email_domain_level_count =
        Number.isInteger(rawDomainLevelCount) && rawDomainLevelCount >= 2
          ? String(rawDomainLevelCount)
          : '2'

      await apiFetch('/config', { method: 'PUT', body: JSON.stringify({ data: values }) })
      form.setFieldsValue({
        mail_provider: values.mail_provider === 'microsoft' || values.mail_provider === 'applemail' ? 'mail_import' : values.mail_provider,
        mail_import_source: values.mail_provider === 'applemail' ? 'applemail' : 'microsoft',
        cpa_enabled: values.cpa_enabled,
        sub2api_enabled: values.sub2api_enabled,
        cfworker_domains: domains,
        cfworker_enabled_domains: enabledDomains,
        cfworker_domain: domains.length > 0 ? '' : values.cfworker_domain,
        cfworker_random_subdomain: values.cfworker_random_subdomain,
        cfworker_random_name_subdomain: values.cfworker_random_name_subdomain,
        contribution_enabled: values.contribution_enabled,
        contribution_mode: values.contribution_mode,
        custom_contribution_url: values.custom_contribution_url,
        custom_contribution_token: values.custom_contribution_token,
        email_domain_rule_enabled: values.email_domain_rule_enabled,
        email_domain_level_count: values.email_domain_level_count,
      })
      message.success('Configuração salva com sucesso')
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const currentTab = TAB_ITEMS.find((t) => t.key === activeTab) as TabConfig
  const mailboxSections =
    activeTab === 'mailbox'
      ? splitMailboxSections(currentTab.sections, currentMailProvider)
      : { defaultSection: null, selectedSection: null, remainingSections: currentTab.sections }
  const floatingSaveWidth = floatingSaveBounds ? Math.max(floatingSaveBounds.width, 0) : 0
  const floatingSaveLeft =
    floatingSaveBounds && floatingSaveWidth > 0
      ? floatingSaveBounds.left + (floatingSaveBounds.width - floatingSaveWidth) / 2
      : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: showFloatingSaveButton ? 96 : 0 }}>
      {showFloatingSaveButton && floatingSaveBounds && floatingSaveWidth > 0 ? (
        <div
          style={{
            position: 'fixed',
            left: floatingSaveLeft,
            bottom: 24,
            zIndex: 1000,
            width: floatingSaveWidth,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              width: '100%',
              padding: 0,
              borderRadius: 0,
              border: 'none',
              background: 'transparent',
              boxShadow: 'none',
              backdropFilter: 'none',
              pointerEvents: 'auto',
            }}
          >
            <Button type="primary" icon={<SaveOutlined />} onClick={save} loading={saving} block>
              {saved ? 'Salvo ✓' : 'Salvar configuração'}
            </Button>
          </div>
        </div>
      ) : null}
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 'bold', margin: 0 }}>Configuração Global</h1>
        <p style={{ color: '#7a8ba3', marginTop: 4 }}>As configurações são salvas permanentemente e usadas automaticamente nas tarefas de registro</p>
      </div>

      <div style={{ display: 'flex', gap: 24 }}>
        <div style={{ width: 200 }}>
          <Tabs
            tabPosition="left"
            activeKey={activeTab}
            onChange={setActiveTab}
            items={TAB_ITEMS.map((t) => ({
              key: t.key,
              label: (
                <span>
                  {t.icon}
                  <span style={{ marginLeft: 8 }}>{t.label}</span>
                </span>
              ),
            }))}
          />
        </div>

        <div ref={contentPaneRef} style={{ flex: 1 }}>
          {activeTab === 'integrations' ? (
            <IntegrationsPanel />
          ) : activeTab === 'security' ? (
            <SecurityPanel />
          ) : (
            <Form form={form} layout="vertical">
              {activeTab === 'contribution' ? (
                <ContributionPanel form={form} onSave={save} saving={saving} saved={saved} />
              ) : (
                <>
                  {activeTab === 'captcha' ? <SolverStatus /> : null}
                  {activeTab === 'mailbox' ? (
                    <>
                      {mailboxSections.defaultSection ? (
                        <ConfigSection key={mailboxSections.defaultSection.title} section={mailboxSections.defaultSection} />
                      ) : null}
                      {mailboxSections.selectedSection ? (
                        <ConfigSection key={`${mailboxSections.selectedSection.title}-selected`} section={mailboxSections.selectedSection} />
                      ) : null}
                      <MailImportPanel form={form} />
                      {currentMailProviderRaw === 'cfworker' ? <CFWorkerDomainPoolSection form={form} /> : null}
                      {mailboxSections.remainingSections.map((section) => (
                        <ConfigSection key={section.title} section={section} />
                      ))}
                      {currentMailProviderRaw !== 'cfworker' ? <CFWorkerDomainPoolSection form={form} /> : null}
                    </>
                  ) : (
                    currentTab.sections.map((section) => (
                      <ConfigSection key={section.title} section={section} />
                    ))
                  )}
                  {showFloatingSaveButton ? <div style={{ height: 8 }} /> : null}
                  {!showFloatingSaveButton ? (
                    <Button type="primary" icon={<SaveOutlined />} onClick={save} loading={saving} block>
                    {saved ? 'Salvo ✓' : 'Salvar configuração'}
                    </Button>
                  ) : null}
                </>
              )}
            </Form>
          )}
        </div>
      </div>
    </div>
  )
}
