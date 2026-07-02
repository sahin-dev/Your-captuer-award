import prisma from "../../../shared/prisma";
import ApiError from "../../../errors/ApiError";
import httpStatus from "http-status";
import mailer from "../../../shared/mailSender";
import { SupportStatus } from "../../../prismaClient";
import { paginationHelper } from "../../../helpers/paginationHelper";

/**
 * Generate a unique ticket number in the format TKT-YYYYMMDD-XXXX
 */
const generateUniqueTicketNumber = async (): Promise<string> => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const dateStr = `${year}${month}${day}`;

  let isUnique = false;
  let ticketNo = "";

  while (!isUnique) {
    const randomNum = String(Math.floor(1000 + Math.random() * 9000));
    ticketNo = `TKT-${dateStr}-${randomNum}`;

    const existing = await prisma.support.findUnique({
      where: { ticket_no: ticketNo },
    });

    if (!existing) {
      isUnique = true;
    }
  }

  return ticketNo;
};

const createSupport = async (data: {
  name: string;
  email: string;
  subject: string;
  message: string;
}) => {
  const ticket_no = await generateUniqueTicketNumber();

  const support = await prisma.support.create({
    data: {
      ticket_no,
      name: data.name,
      email: data.email,
      subject: data.subject,
      message: data.message,
    },
  });

  return support;
};

const updateSupportStatus = async (id: string, status: SupportStatus) => {
  const ticket = await prisma.support.findUnique({
    where: { id },
  });

  if (!ticket) {
    throw new ApiError(httpStatus.NOT_FOUND, "Support ticket not found");
  }

  if (ticket.status !== status) {
    const updatedTicket = await prisma.support.update({
      where: { id },
      data: { status },
    });

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <div style="text-align: center; border-bottom: 2px solid #0056b3; padding-bottom: 15px;">
          <h2 style="color: #0056b3; margin: 0;">Support Ticket Update</h2>
        </div>
        <div style="padding: 20px 0; line-height: 1.6; color: #333;">
          <p>Dear <strong>${ticket.name}</strong>,</p>
          <p>The status of your support ticket <strong>${ticket.ticket_no}</strong> has been updated.</p>
          <div style="background-color: #f8f9fa; border-left: 4px solid #0056b3; padding: 15px; margin: 20px 0; border-radius: 4px;">
            <p style="margin: 0 0 10px 0;"><strong>Ticket Number:</strong> ${ticket.ticket_no}</p>
            <p style="margin: 0 0 10px 0;"><strong>Subject:</strong> ${ticket.subject}</p>
            <p style="margin: 0;"><strong>New Status:</strong> <span style="background-color: #e3f2fd; color: #0d47a1; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 0.9em;">${status}</span></p>
          </div>
          <p>Our team is working diligently on resolving your request. If you have any questions, please reply directly to this email.</p>
        </div>
        <div style="text-align: center; border-top: 1px solid #e0e0e0; padding-top: 15px; font-size: 0.8em; color: #777;">
          <p>This is an automated notification from the Your Capture Award Support Team.</p>
        </div>
      </div>
    `;

    // Send the status update email in the background
    mailer(
      ticket.email,
      emailHtml,
      `Update on Support Ticket: ${ticket.ticket_no}`
    ).catch((err) => {
      console.error("Failed to send status update email:", err);
    });

    return updatedTicket;
  }

  return ticket;
};

const getAllSupports = async (page: number = 1, limit: number = 10, search?: string) => {
  console.log("search", search)
  const { skip, limit: paginationLimit } = paginationHelper.calculatePagination({
    page,
    limit,
  });

  const [supports, total] = await Promise.all([
    prisma.support.findMany({
      skip,
      take: paginationLimit,
      orderBy: { createdAt: "desc" },
      where: search ? { ticket_no: { contains: search, mode: 'insensitive' }, email: { contains: search, mode: 'insensitive' } } : {}
    }),
    prisma.support.count({
      where: search ? { ticket_no: { contains: search, mode: 'insensitive' }, email: { contains: search, mode: 'insensitive' } } : {}
    }),
  ]);

  const meta = paginationHelper.getPaginationMetaData(
    page,
    paginationLimit,
    total
  );

  return { data: supports, meta };
};

const getSupportById = async (id: string) => {
  const support = await prisma.support.findUnique({
    where: { id },
  });

  if (!support) {
    throw new ApiError(httpStatus.NOT_FOUND, "Support ticket not found");
  }

  return support;
};

export const supportService = {
  createSupport,
  updateSupportStatus,
  getAllSupports,
  getSupportById,
};
