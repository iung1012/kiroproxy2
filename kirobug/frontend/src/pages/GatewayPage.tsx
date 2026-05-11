import { useEffect, useState } from 'react'
import {
  Card, Col, Row, Statistic, Tag, Typography, Space,
  Divider, Input, Button, Tooltip, Spin, Alert, Badge,
} from 'antd'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  CopyOutlined,
  ReloadOutlined,
  ApiOutlined,
  KeyOutlined,
  RobotOutlined,
  SyncOutlined,
} from '@ant-design/icons'
import { apiFetch } from '@/lib/utils'

const { Title, Text, Paragraph } = Typography

interface GatewayStatus {
  online: boolean
  url: string
  synced_accounts: number
  total_accounts: number
  models: string[]
}

function CopyInput({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div style={{ marginBottom: 12 }}>
      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
        {label}
      </Text>
      <Input.Group compact style={{ display: 'flex' }}>
        <Input value={value} readOnly style={{ fontFamily: 'monospace', fontSize: 13 }} />
        <Tooltip title={copied ? 'Copiado!' : 'Copiar'}>
          <Button icon={<CopyOutlined />} onClick={copy} type={copied ? 'primary' : 'default'} />
        </Tooltip>
      </Input.Group>
    </div>
  )
}

export default function GatewayPage() {
  const [status, setStatus] = useState<GatewayStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('gateway_api_key') || '')

  const load = async () => {
    setLoading(true)
    try {
      const data = await apiFetch('/gateway/status')
      setStatus(data)
    } catch {
      setStatus(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const saveApiKey = (val: string) => {
    setApiKey(val)
    localStorage.setItem('gateway_api_key', val)
  }

  const baseUrl = window.location.origin

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <Title level={4} style={{ margin: 0 }}>
          <ApiOutlined style={{ marginRight: 8 }} />
          Kiro Gateway
        </Title>
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
          Atualizar
        </Button>
      </div>

      {loading && !status ? (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin size="large" />
        </div>
      ) : (
        <>
          {/* Status Cards */}
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col xs={24} sm={8}>
              <Card>
                <Statistic
                  title="Status do Gateway"
                  value={status?.online ? 'Online' : 'Offline'}
                  prefix={
                    status?.online
                      ? <CheckCircleOutlined style={{ color: '#52c41a' }} />
                      : <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
                  }
                  valueStyle={{ color: status?.online ? '#52c41a' : '#ff4d4f' }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card>
                <Statistic
                  title="Contas Sincronizadas"
                  value={status?.synced_accounts ?? '—'}
                  suffix={status ? `/ ${status.total_accounts}` : ''}
                  prefix={<SyncOutlined />}
                />
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card>
                <Statistic
                  title="Modelos Disponíveis"
                  value={status?.models?.length ?? '—'}
                  prefix={<RobotOutlined />}
                />
              </Card>
            </Col>
          </Row>

          {!status?.online && (
            <Alert
              type="warning"
              showIcon
              message="Gateway offline"
              description="O kiro-gateway não respondeu. Verifique se o container está rodando e se há contas sincronizadas."
              style={{ marginBottom: 24 }}
            />
          )}

          {/* Modelos */}
          {status?.models && status.models.length > 0 && (
            <Card title={<><RobotOutlined /> Modelos disponíveis</>} style={{ marginBottom: 24 }}>
              <Space wrap>
                {status.models.map(m => (
                  <Tag key={m} color="blue" style={{ fontFamily: 'monospace' }}>{m}</Tag>
                ))}
              </Space>
            </Card>
          )}

          {/* API Key */}
          <Card
            title={<><KeyOutlined /> Chave de API (PROXY_API_KEY)</>}
            style={{ marginBottom: 24 }}
          >
            <Paragraph type="secondary" style={{ fontSize: 13 }}>
              Insira sua chave para gerar os exemplos de uso abaixo. A chave é salva localmente no browser.
            </Paragraph>
            <Input.Password
              value={apiKey}
              onChange={e => saveApiKey(e.target.value)}
              placeholder="Cole aqui o valor do PROXY_API_KEY"
              style={{ maxWidth: 480, fontFamily: 'monospace' }}
            />
          </Card>

          {/* Endpoints */}
          <Card title={<><ApiOutlined /> Endpoints da API</>}>
            <Paragraph type="secondary" style={{ marginBottom: 16, fontSize: 13 }}>
              O gateway é compatível com clientes OpenAI e Anthropic. Use os endpoints abaixo com o header de autenticação.
            </Paragraph>

            <Divider orientation="left" orientationMargin={0}>
              <Badge color="green" text="OpenAI compatível" />
            </Divider>
            <CopyInput
              label="Chat Completions"
              value={`${baseUrl}/v1/chat/completions`}
            />
            <CopyInput
              label="Listar modelos"
              value={`${baseUrl}/v1/models`}
            />

            <Divider orientation="left" orientationMargin={0}>
              <Badge color="purple" text="Anthropic compatível" />
            </Divider>
            <CopyInput
              label="Messages"
              value={`${baseUrl}/v1/messages`}
            />

            <Divider orientation="left" orientationMargin={0}>
              <Text type="secondary" style={{ fontSize: 12 }}>Header de autenticação</Text>
            </Divider>
            <CopyInput
              label="Authorization header"
              value={apiKey ? `Bearer ${apiKey}` : 'Bearer <sua-PROXY_API_KEY>'}
            />

            <Divider orientation="left" orientationMargin={0}>
              <Text type="secondary" style={{ fontSize: 12 }}>Exemplo curl (OpenAI)</Text>
            </Divider>
            <Input.TextArea
              readOnly
              rows={6}
              style={{ fontFamily: 'monospace', fontSize: 12 }}
              value={`curl ${baseUrl}/v1/chat/completions \\
  -H "Authorization: Bearer ${apiKey || '<sua-PROXY_API_KEY>'}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "claude-sonnet-4-5",
    "messages": [{"role": "user", "content": "Olá!"}],
    "stream": false
  }'`}
            />
            <Button
              icon={<CopyOutlined />}
              size="small"
              style={{ marginTop: 8 }}
              onClick={() => {
                navigator.clipboard.writeText(
                  `curl ${baseUrl}/v1/chat/completions \\\n  -H "Authorization: Bearer ${apiKey || '<sua-PROXY_API_KEY>'}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"claude-sonnet-4-5","messages":[{"role":"user","content":"Olá!"}],"stream":false}'`
                )
              }}
            >
              Copiar curl
            </Button>
          </Card>
        </>
      )}
    </div>
  )
}
