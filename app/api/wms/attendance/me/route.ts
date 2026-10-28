import { requireUser } from "@/app/lib/auth";
import { attendanceForEmail, getWmsAttendance, toWmsProfileImageUrl } from "@/app/lib/wms-attendance";

export async function GET() {
  try {
    const { email } = await requireUser();
    const record = attendanceForEmail(await getWmsAttendance(), email);
    return Response.json({ profileImage: toWmsProfileImageUrl(record?.profileImage) });
  } catch (error) {
    return Response.json({ profileImage: null, message: error instanceof Error ? error.message : "Attendance is unavailable." }, { status: 200 });
  }
}
