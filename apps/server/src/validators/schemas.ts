import { z } from "zod";
import { isValidPositiveMoney } from "../utils/money.js";

const uuid = z.string().uuid();
const money = z.union([z.string(), z.number()]).refine((value) => isValidPositiveMoney(value), {
  message: "Nominal wajib lebih besar dari nol"
});

export const registerSchema = z.object({
  fullName: z.string().min(2).max(160),
  email: z.string().email().max(255),
  password: z.string().min(8).max(120),
  currency: z.string().length(3).default("IDR")
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export const accountSchema = z.object({
  name: z.string().min(2).max(140),
  accountType: z.enum(["cash", "bank", "e_wallet", "credit_card", "other"]),
  initialBalance: money,
  currency: z.string().length(3).default("IDR"),
  allowNegative: z.boolean().default(false),
  isActive: z.boolean().default(true)
});

export const accountUpdateSchema = accountSchema.partial();

export const categorySchema = z.object({
  name: z.string().min(2).max(120),
  categoryType: z.enum(["income", "expense"]),
  icon: z.string().min(1).max(64).default("Circle")
});

export const categoryUpdateSchema = categorySchema.partial();

export const transactionItemSchema = z.object({
  itemName: z.string().min(1).max(220),
  quantity: z.union([z.string(), z.number()]).default(1),
  unitPrice: z.union([z.string(), z.number()]).default(0),
  totalPrice: z.union([z.string(), z.number()]).default(0)
});

export const transactionSchema = z.object({
  accountId: uuid,
  transactionType: z.enum(["income", "expense"]),
  transactionDate: z.string().datetime().or(z.string().date()),
  amount: money,
  categoryId: uuid.optional().nullable(),
  merchantName: z.string().max(180).optional().nullable(),
  paymentMethod: z.string().max(80).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  sourceType: z.enum(["manual", "receipt"]).default("manual"),
  receiptId: uuid.optional().nullable(),
  attachmentUrl: z.string().optional().nullable(),
  status: z.string().max(40).default("posted"),
  items: z.array(transactionItemSchema).default([])
});

export const transferSchema = z.object({
  sourceAccountId: uuid,
  destinationAccountId: uuid,
  amount: money,
  transferDate: z.string().datetime().or(z.string().date()),
  notes: z.string().max(2000).optional().nullable()
});

export const budgetSchema = z.object({
  categoryId: uuid,
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000).max(2100),
  budgetAmount: money
});

export const budgetUpdateSchema = budgetSchema.partial();

export const receiptConfirmSchema = z.object({
  accountId: uuid,
  categoryId: uuid.optional().nullable(),
  merchantName: z.string().min(1).max(180),
  transactionDate: z.string().datetime().or(z.string().date()),
  amount: money,
  paymentMethod: z.string().max(80).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  items: z.array(transactionItemSchema).default([])
});

export const assistantChatSchema = z.object({
  message: z.string().min(1).max(1000)
});

export const transactionTextParseSchema = z.object({
  text: z.string().min(3).max(500),
  defaultAccountId: uuid.optional().nullable()
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(120)
});
