package coza.wacko.fuelbuddy;

import android.graphics.Rect;
import android.net.Uri;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

/**
 * Reads the text on a photo of a fuel slip with ML Kit's on-device recognizer
 * (bundled model: works offline, nothing is uploaded). Returns every line with its
 * position so the app can rebuild rows such as "LITRES ........ 40.25".
 */
@CapacitorPlugin(name = "SlipScanner")
public class SlipScannerPlugin extends Plugin {

    private TextRecognizer recognizer;

    @Override
    public void load() {
        recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
    }

    @PluginMethod
    public void recognize(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.isEmpty()) {
            call.reject("No photo given.");
            return;
        }
        InputImage image;
        try {
            // Handles content:// and file:// URIs and applies the photo's EXIF rotation.
            image = InputImage.fromFilePath(getContext(), Uri.parse(path));
        } catch (Exception e) {
            call.reject("Could not open the photo.", e);
            return;
        }
        recognizer.process(image)
            .addOnSuccessListener(result -> call.resolve(toJs(result, image)))
            .addOnFailureListener(e -> call.reject("Could not read the slip.", e));
    }

    private static JSObject toJs(Text result, InputImage image) {
        JSArray lines = new JSArray();
        for (Text.TextBlock block : result.getTextBlocks()) {
            for (Text.Line line : block.getLines()) {
                Rect box = line.getBoundingBox();
                if (box == null) continue;
                JSObject item = new JSObject();
                item.put("text", line.getText());
                item.put("left", box.left);
                item.put("top", box.top);
                item.put("right", box.right);
                item.put("bottom", box.bottom);
                item.put("angle", line.getAngle()); // degrees; lets the app straighten a tilted photo
                lines.put(item);
            }
        }
        JSObject out = new JSObject();
        out.put("text", result.getText());
        out.put("lines", lines);
        out.put("width", image.getWidth());
        out.put("height", image.getHeight());
        return out;
    }

    @Override
    protected void handleOnDestroy() {
        if (recognizer != null) recognizer.close();
    }
}
