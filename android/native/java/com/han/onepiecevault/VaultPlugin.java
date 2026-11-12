package com.han.onepiecevault;

import android.Manifest;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.Build;
import android.os.ParcelFileDescriptor;
import android.provider.MediaStore;
import android.util.Base64;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

/**
 * ปลั๊กอิน "คลังฟุตเทจ" — อ่านอย่างเดียว:
 *  listVideos (รายการวิดีโอจาก MediaStore) · fingerprint (ลายนิ้วมือไฟล์) · thumbnail (ภาพตัวอย่าง)
 *  openExternal (เปิดด้วยแอปเล่นวิดีโอ) · shareFile (ส่งไฟล์สำรอง/แผนย้ายออกไปแอปอื่น)
 * ห้ามเพิ่มโค้ดย้าย/ลบ/เปลี่ยนชื่อ/เขียนทับไฟล์วิดีโอ (มีเทสต์ android/tests/safety.test.js เฝ้าอยู่)
 */
@CapacitorPlugin(name = "OPVault", permissions = {
    @Permission(alias = "video", strings = { Manifest.permission.READ_MEDIA_VIDEO }),
    @Permission(alias = "storage", strings = { Manifest.permission.READ_EXTERNAL_STORAGE })
})
public class VaultPlugin extends Plugin {
    private String alias() {
        return Build.VERSION.SDK_INT >= 33 ? "video" : "storage";
    }

    private boolean granted() {
        return getPermissionState(alias()) == PermissionState.GRANTED;
    }

    @PluginMethod
    public void hasAccess(PluginCall call) {
        JSObject r = new JSObject();
        r.put("granted", granted());
        call.resolve(r);
    }

    @PluginMethod
    public void requestAccess(PluginCall call) {
        if (granted()) { hasAccess(call); return; }
        requestPermissionForAlias(alias(), call, "accessResult");
    }

    @PermissionCallback
    private void accessResult(PluginCall call) {
        hasAccess(call);
    }

    @PluginMethod
    public void listVideos(PluginCall call) {
        if (!granted()) { call.reject("no access"); return; }
        Uri collection = Build.VERSION.SDK_INT >= 29
            ? MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL)
            : MediaStore.Video.Media.EXTERNAL_CONTENT_URI;
        String[] proj = {
            MediaStore.Video.Media._ID, MediaStore.Video.Media.DISPLAY_NAME, MediaStore.Video.Media.SIZE,
            MediaStore.Video.Media.DATE_MODIFIED, MediaStore.Video.Media.DURATION,
            MediaStore.Video.Media.WIDTH, MediaStore.Video.Media.HEIGHT, MediaStore.Video.Media.DATA
        };
        JSArray items = new JSArray();
        try (Cursor c = getContext().getContentResolver().query(collection, proj, null, null, MediaStore.Video.Media.DISPLAY_NAME + " ASC")) {
            if (c != null) {
                while (c.moveToNext()) {
                    long id = c.getLong(0);
                    String name = c.getString(1);
                    String data = c.getString(7);
                    JSObject o = new JSObject();
                    o.put("uri", Uri.withAppendedPath(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, String.valueOf(id)).toString());
                    o.put("name", name == null ? ("video-" + id) : name);
                    o.put("path", data != null ? data : ("content:" + id));
                    o.put("size", c.getLong(2));
                    o.put("mtime", c.getLong(3) * 1000L);
                    o.put("durationMs", c.getLong(4));
                    o.put("w", c.getInt(5));
                    o.put("h", c.getInt(6));
                    items.put(o);
                }
            }
        } catch (Exception e) {
            call.reject("list failed: " + e);
            return;
        }
        JSObject r = new JSObject();
        r.put("items", items);
        call.resolve(r);
    }

    @PluginMethod
    public void fingerprint(PluginCall call) {
        String uri = call.getString("uri");
        if (uri == null) { call.reject("uri is required"); return; }
        try (ParcelFileDescriptor pfd = getContext().getContentResolver().openFileDescriptor(Uri.parse(uri), "r");
             FileInputStream in = new FileInputStream(pfd.getFileDescriptor())) {
            JSObject r = new JSObject();
            r.put("fp", Fingerprint.compute(in.getChannel(), pfd.getStatSize()));
            call.resolve(r);
        } catch (Exception e) {
            call.reject("fingerprint failed: " + e);
        }
    }

    @PluginMethod
    public void thumbnail(PluginCall call) {
        String uri = call.getString("uri");
        if (uri == null) { call.reject("uri is required"); return; }
        long durMs = call.getLong("durationMs", 0L);
        MediaMetadataRetriever mmr = new MediaMetadataRetriever();
        try {
            mmr.setDataSource(getContext(), Uri.parse(uri));
            long atUs = Math.min(1_000_000L, durMs * 1000L / 3);
            int vw = parseInt(mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH));
            int vh = parseInt(mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT));
            int rot = parseInt(mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION));
            if (rot == 90 || rot == 270) { int t = vw; vw = vh; vh = t; }
            int w = 240;
            Bitmap s;
            if (Build.VERSION.SDK_INT >= 27 && vw > 0 && vh > 0) {
                // ย่อภาพตั้งแต่ตอนดึงเฟรม ไม่โหลดภาพเต็ม 4K เข้าหน่วยความจำ (ไฟล์เป็นพันต่อเนื่องจะไม่ทำให้แอปเด้ง)
                int h = Math.max(1, Math.round(w * (float) vh / vw));
                s = mmr.getScaledFrameAtTime(atUs, MediaMetadataRetriever.OPTION_CLOSEST_SYNC, w, h);
                if (s == null) s = mmr.getScaledFrameAtTime(-1, MediaMetadataRetriever.OPTION_CLOSEST_SYNC, w, h);
            } else {
                Bitmap b = mmr.getFrameAtTime(atUs, MediaMetadataRetriever.OPTION_CLOSEST_SYNC);
                if (b == null) b = mmr.getFrameAtTime();
                if (b == null) { call.reject("no frame"); return; }
                int h = Math.max(1, Math.round(w * (float) b.getHeight() / b.getWidth()));
                s = Bitmap.createScaledBitmap(b, w, h, true);
                if (s != b) b.recycle();
            }
            if (s == null) { call.reject("no frame"); return; }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            s.compress(Bitmap.CompressFormat.JPEG, 72, out);
            s.recycle();
            JSObject r = new JSObject();
            r.put("data", Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP));
            call.resolve(r);
        } catch (Exception e) {
            call.reject("thumbnail failed: " + e);
        } finally {
            try { mmr.release(); } catch (Exception ignored) {}
        }
    }

    private static int parseInt(String v) {
        try { return v == null ? 0 : Integer.parseInt(v.trim()); } catch (NumberFormatException e) { return 0; }
    }

    @PluginMethod
    public void openExternal(PluginCall call) {
        String uri = call.getString("uri");
        if (uri == null) { call.reject("uri is required"); return; }
        Intent i = new Intent(Intent.ACTION_VIEW);
        i.setDataAndType(Uri.parse(uri), "video/*");
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("no player: " + e);
        }
    }

    /** เขียนข้อความลงไฟล์ในแคชของแอป แล้วเปิดหน้าต่างแชร์ (ไม่แตะไฟล์ของผู้ใช้) */
    @PluginMethod
    public void shareFile(PluginCall call) {
        String name = call.getString("name", "export.json").replaceAll("[^A-Za-z0-9._-]", "_");
        String text = call.getString("text", "");
        String mime = call.getString("mime", "application/json");
        try {
            File dir = new File(getContext().getCacheDir(), "exports");
            if (!dir.exists() && !dir.mkdirs()) { call.reject("cannot create cache folder"); return; }
            File f = new File(dir, name);
            try (FileOutputStream out = new FileOutputStream(f, false)) {
                out.write(text.getBytes(StandardCharsets.UTF_8));
            }
            Uri u = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", f);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(mime);
            send.putExtra(Intent.EXTRA_STREAM, u);
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(send, name);
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(chooser);
            call.resolve();
        } catch (Exception e) {
            call.reject("share failed: " + e);
        }
    }
}
