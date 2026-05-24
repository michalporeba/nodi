export class ValidationError extends Error {
  constructor(public readonly fields: Record<string, string>) {
    super(Object.values(fields).join('; '))
    this.name = 'ValidationError'
  }
}

type Rule<T> = {
  type: 'string' | 'number' | 'boolean'
  required?: boolean
  nullable?: boolean
  enum?: string[]
}

type Schema = Record<string, Rule<unknown>>

export function validate<T extends Record<string, unknown>>(body: unknown, schema: Schema): T {
  if (typeof body !== 'object' || body === null) {
    throw new ValidationError({ _body: 'Request body must be a JSON object' })
  }
  const obj = body as Record<string, unknown>
  const errors: Record<string, string> = {}

  for (const [field, rule] of Object.entries(schema)) {
    const val = obj[field]
    const missing = val === undefined
    const isNull = val === null

    if (rule.required && missing) {
      errors[field] = `${field} is required`
      continue
    }
    if (missing) continue

    if (isNull) {
      if (!rule.nullable) errors[field] = `${field} must not be null`
      continue
    }

    if (typeof val !== rule.type) {
      errors[field] = `${field} must be a ${rule.type}`
      continue
    }

    if (rule.enum && !rule.enum.includes(val as string)) {
      errors[field] = `${field} must be one of: ${rule.enum.join(', ')}`
    }
  }

  if (Object.keys(errors).length > 0) throw new ValidationError(errors)
  return obj as T
}

export function validateOneOf(obj: Record<string, unknown>, fields: string[]): string | null {
  const present = fields.filter(f => obj[f] != null && obj[f] !== '')
  if (present.length === 1) return null
  if (present.length === 0) return `Exactly one of [${fields.join(', ')}] is required`
  return `Provide exactly one of [${fields.join(', ')}], not both: ${present.join(', ')}`
}
