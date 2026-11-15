package local.webdav.android;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Iterator;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.HttpUrl;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.ResponseBody;

@CapacitorPlugin(name = "WebDavHttp")
public class WebDavHttpPlugin extends Plugin {
    private static final int MAX_BYTES = 48 * 1024 * 1024;
    private final Map<String, Call> requests = new ConcurrentHashMap<>();
    private final OkHttpClient client = new OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .callTimeout(120, TimeUnit.SECONDS)
        .followRedirects(false)
        .followSslRedirects(false)
        .retryOnConnectionFailure(false)
        .build();

    @PluginMethod
    public void request(PluginCall call) {
        String id = call.getString("id");
        String method = call.getString("method", "");
        HttpUrl url = HttpUrl.parse(call.getString("url", ""));
        if (id == null || id.isEmpty() || url == null ||
            !url.username().isEmpty() || !url.password().isEmpty() ||
            !Arrays.asList("PROPFIND", "MKCOL", "PUT", "GET").contains(method)) {
            call.reject("Invalid WebDAV request.", "INVALID_REQUEST");
            return;
        }
        int limit = Math.min(MAX_BYTES, Math.max(1, call.getInt("maxResponseBytes", MAX_BYTES)));
        JSObject headers = call.getObject("headers", new JSObject());
        String body = call.getString("body");
        try {
            byte[] bytes = body == null ? null : body.getBytes(StandardCharsets.UTF_8);
            if (bytes != null && bytes.length > MAX_BYTES) {
                call.reject("WebDAV request is too large.", "SIZE_LIMIT");
                return;
            }
            Request.Builder builder = new Request.Builder().url(url);
            Iterator<String> names = headers.keys();
            while (names.hasNext()) {
                String name = names.next();
                String value = headers.getString(name);
                if (value != null) builder.header(name, value);
            }
            RequestBody requestBody = bytes == null ? null : RequestBody.create(
                MediaType.parse(headers.getString("Content-Type", "application/json; charset=utf-8")), bytes
            );
            if ("PUT".equals(method) && requestBody == null) {
                requestBody = RequestBody.create(MediaType.parse("application/json"), new byte[0]);
            }
            Call request = client.newCall(builder.method(method, requestBody).build());
            if (requests.putIfAbsent(id, request) != null) {
                call.reject("Duplicate WebDAV request.", "INVALID_REQUEST");
                return;
            }
            request.enqueue(new Callback() {
                @Override
                public void onFailure(Call request, IOException error) {
                    requests.remove(id, request);
                    call.reject(
                        request.isCanceled() ? "WebDAV request cancelled." : "WebDAV network request failed.",
                        request.isCanceled() ? "CANCELLED" : "NETWORK_ERROR"
                    );
                }

                @Override
                public void onResponse(Call request, Response response) {
                    try (Response closed = response) {
                        ResponseBody responseBody = closed.body();
                        String data = "";
                        if (responseBody != null) {
                            if (responseBody.contentLength() > limit) throw new IOException("SIZE_LIMIT");
                            try (InputStream input = responseBody.byteStream();
                                 ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                                byte[] buffer = new byte[8192];
                                int count;
                                int total = 0;
                                while ((count = input.read(buffer)) != -1) {
                                    total += count;
                                    if (total > limit) throw new IOException("SIZE_LIMIT");
                                    output.write(buffer, 0, count);
                                }
                                data = new String(output.toByteArray(), StandardCharsets.UTF_8);
                            }
                        }
                        JSObject result = new JSObject();
                        result.put("status", closed.code());
                        result.put("data", data);
                        String location = closed.header("Location");
                        if (location != null) result.put("location", location);
                        call.resolve(result);
                    } catch (IOException error) {
                        call.reject(
                            "SIZE_LIMIT".equals(error.getMessage()) ? "WebDAV response is too large." : "WebDAV response failed.",
                            "SIZE_LIMIT".equals(error.getMessage()) ? "SIZE_LIMIT" : "NETWORK_ERROR"
                        );
                    } finally {
                        requests.remove(id, request);
                    }
                }
            });
        } catch (IllegalArgumentException error) {
            call.reject("Invalid WebDAV request.", "INVALID_REQUEST");
        }
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        String id = call.getString("id", "");
        Call request = requests.get(id);
        if (request != null) request.cancel();
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        for (Call request : requests.values()) request.cancel();
        requests.clear();
        client.dispatcher().executorService().shutdown();
        client.connectionPool().evictAll();
        super.handleOnDestroy();
    }
}
