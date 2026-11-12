package com.han.onepiecevault;

import java.io.RandomAccessFile;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/**
 * ลายนิ้วมือไฟล์ (ต้องตรงกับ android/www/js/lib/fingerprint.js):
 * SHA-256("OPV1|<size>|" + 3 ช่วง x 256 KB: ต้น/กลาง/ท้าย) · ไฟล์ <= 768 KB ใช้ทั้งไฟล์
 * อ่านอย่างเดียว ไม่มีการเขียน/ลบไฟล์
 */
public final class Fingerprint {
    static final int CHUNK = 256 * 1024;

    private Fingerprint() {}

    public static String compute(FileChannel ch, long size) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        md.update(("OPV1|" + size + "|").getBytes(StandardCharsets.UTF_8));
        if (size > 0) {
            long[] offs;
            int len;
            if (size <= (long) CHUNK * 3) {
                offs = new long[] { 0 };
                len = (int) size;
            } else {
                offs = new long[] { 0, (size - CHUNK) / 2, size - CHUNK };
                len = CHUNK;
            }
            ByteBuffer buf = ByteBuffer.allocate(len);
            for (long off : offs) {
                buf.clear();
                long pos = off;
                while (buf.hasRemaining()) {
                    int n = ch.read(buf, pos);
                    if (n < 0) throw new java.io.EOFException("file shorter than expected");
                    pos += n;
                }
                md.update(buf.array(), 0, len);
            }
        }
        StringBuilder sb = new StringBuilder("v1-");
        for (byte b : md.digest()) sb.append(String.format("%02x", b & 0xff));
        return sb.toString();
    }

    /** ใช้ทดสอบบนเครื่องพัฒนา/CI: java Fingerprint <ไฟล์> */
    public static void main(String[] args) throws Exception {
        try (RandomAccessFile f = new RandomAccessFile(args[0], "r")) {
            System.out.println(compute(f.getChannel(), f.length()));
        }
    }
}
