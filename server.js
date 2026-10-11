import express from 'express'
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm'

const REGION = 'ap-southeast-2'
const BUCKET = process.env.BUCKET_NAME

// 注意：没有任何 access key，SDK 自动从 EC2 的 IAM role 拿临时凭证
const s3 = new S3Client({ region: REGION })
const ssm = new SSMClient({ region: REGION })

const { Parameter } = await ssm.send(new GetParameterCommand({
  Name: '/demo/api-key',
  WithDecryption: true
}))
const API_KEY = Parameter.Value
console.log('Loaded secret from Parameter Store')

const app = express()
app.use(express.json())

app.get('/health', (req, res) => res.json({ ok: true }))

// 简单鉴权：请求头带上 x-api-key
app.use((req, res, next) => {
  if (req.headers['x-api-key'] !== API_KEY) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  next()
})

app.put('/files/:name', async (req, res) => {
  try {
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: `uploads/${req.params.name}`,
      Body: JSON.stringify(req.body),
      ContentType: 'application/json'
    }))
    res.status(201).json({ saved: req.params.name })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'upload failed' })
  }
})

app.get('/files/:name', async (req, res) => {
  try {
    const obj = await s3.send(new GetObjectCommand({
      Bucket: BUCKET,
      Key: `uploads/${req.params.name}`
    }))
    res.type('json').send(await obj.Body.transformToString())
  } catch (err) {
    res.status(404).json({ error: 'not found' })
  }
})

app.listen(3000, () => console.log('API on :3000'))