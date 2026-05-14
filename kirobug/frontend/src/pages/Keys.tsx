import { useEffect, useState } from 'react'
import {
  Button,
  Table,
  Modal,
  Form,
  Input,
  InputNumber,
  DatePicker,
  Space,
  Tag,
  Typography,
  Popconfirm,
  Switch,
  message,
  Tooltip,
  Card,
} from 'antd'
import {
  PlusOutlined,
  DeleteOutlined,
  CopyOutlined,
  KeyOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { apiFetch } from '@/lib/utils'

const { Text } = Typography

interface ApiKey {
  id: string
  key: string
  name: string
  daily_limit: number
  expires_at: string | null
  created_at: string
  requests_today: number
  total_requests: number
  is_active: number
}

export default function Keys() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newKey, setNewKey] = useState<ApiKey | null>(null)
  const [form] = Form.useForm()

  const fetchKeys = async () => {
    setLoading(true)
    try {
      const data = await apiFetch('/keys')
      setKeys(data || [])
    } catch {
      message.error('Erro ao carregar keys')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchKeys() }, [])

  const handleCreate = async (values: any) => {
    setCreating(true)
    try {
      const payload = {
        name: values.name,
        daily_limit: values.daily_limit ?? -1,
        expires_at: values.expires_at ? values.expires_at.format('YYYY-MM-DD') : null,
      }
      const data = await apiFetch('/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      setNewKey(data)
      setModalOpen(false)
      form.resetFields()
      fetchKeys()
    } catch {
      message.error('Erro ao criar key')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await apiFetch(`/keys/${id}`, { method: 'DELETE' })
      message.success('Key removida')
      fetchKeys()
    } catch {
      message.error('Erro ao remover key')
    }
  }

  const handleToggle = async (id: string, active: boolean) => {
    try {
      await apiFetch(`/keys/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: active }),
      })
      fetchKeys()
    } catch {
      message.error('Erro ao atualizar key')
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    message.success('Copiado!')
  }

  const columns = [
    {
      title: 'Nome',
      dataIndex: 'name',
      key: 'name',
      render: (v: string) => <Text strong>{v}</Text>,
    },
    {
      title: 'Key',
      dataIndex: 'key',
      key: 'key',
      render: (v: string) => (
        <Space>
          <Text code style={{ fontSize: 12 }}>
            {v.slice(0, 10)}...{v.slice(-6)}
          </Text>
          <Tooltip title="Copiar key completa">
            <Button
              size="small"
              icon={<CopyOutlined />}
              onClick={() => copyToClipboard(v)}
            />
          </Tooltip>
        </Space>
      ),
    },
    {
      title: 'Limite Diário',
      dataIndex: 'daily_limit',
      key: 'daily_limit',
      render: (v: number) =>
        v === -1 ? <Tag color="green">Ilimitado</Tag> : <Tag color="blue">{v} req/dia</Tag>,
    },
    {
      title: 'Expira em',
      dataIndex: 'expires_at',
      key: 'expires_at',
      render: (v: string | null) => {
        if (!v) return <Text type="secondary">—</Text>
        const expired = dayjs(v).isBefore(dayjs())
        return <Tag color={expired ? 'red' : 'orange'}>{dayjs(v).format('DD/MM/YYYY')}</Tag>
      },
    },
    {
      title: 'Hoje',
      dataIndex: 'requests_today',
      key: 'requests_today',
      render: (v: number) => <Text>{v}</Text>,
    },
    {
      title: 'Total',
      dataIndex: 'total_requests',
      key: 'total_requests',
      render: (v: number) => <Text>{v}</Text>,
    },
    {
      title: 'Status',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (v: number, record: ApiKey) => (
        <Switch
          checked={v === 1}
          size="small"
          onChange={(checked) => handleToggle(record.id, checked)}
        />
      ),
    },
    {
      title: 'Ações',
      key: 'actions',
      render: (_: any, record: ApiKey) => (
        <Popconfirm
          title="Remover esta key?"
          onConfirm={() => handleDelete(record.id)}
          okText="Sim"
          cancelText="Não"
        >
          <Button size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          <KeyOutlined style={{ marginRight: 8 }} />
          Gerenciar Keys
        </Typography.Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchKeys} loading={loading}>
            Atualizar
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            Nova Key
          </Button>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={keys}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20 }}
        locale={{ emptyText: 'Nenhuma key criada ainda' }}
      />

      {/* Modal: criar key */}
      <Modal
        title="Criar Nova Key"
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields() }}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item
            label="Nome / Cliente"
            name="name"
            rules={[{ required: true, message: 'Informe um nome' }]}
          >
            <Input placeholder="Ex: João Silva" />
          </Form.Item>

          <Form.Item label="Limite de requisições por dia" name="daily_limit">
            <InputNumber
              style={{ width: '100%' }}
              min={-1}
              placeholder="-1 para ilimitado"
            />
          </Form.Item>

          <Form.Item label="Data de expiração" name="expires_at">
            <DatePicker
              style={{ width: '100%' }}
              format="DD/MM/YYYY"
              disabledDate={(d) => d && d.isBefore(dayjs())}
              placeholder="Sem expiração"
            />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={creating} block>
              Criar Key
            </Button>
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal: mostrar key criada */}
      <Modal
        title="Key Criada com Sucesso!"
        open={!!newKey}
        onCancel={() => setNewKey(null)}
        footer={
          <Button type="primary" onClick={() => setNewKey(null)}>
            Fechar
          </Button>
        }
      >
        {newKey && (
          <Card>
            <Text type="warning" strong>
              Copie esta key agora — ela não será exibida novamente completa na tabela.
            </Text>
            <div style={{ marginTop: 12 }}>
              <Text code style={{ fontSize: 13, wordBreak: 'break-all' }}>
                {newKey.key}
              </Text>
            </div>
            <Button
              style={{ marginTop: 12 }}
              icon={<CopyOutlined />}
              onClick={() => copyToClipboard(newKey.key)}
            >
              Copiar Key
            </Button>
          </Card>
        )}
      </Modal>
    </div>
  )
}
