package myapp.ctf.client;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;

public class PrettyPrinter {
    private static final ObjectMapper mapper = new ObjectMapper()
            .enable(SerializationFeature.INDENT_OUTPUT)
            .disable(SerializationFeature.FAIL_ON_EMPTY_BEANS);

    public static String toJson(Object data) {
        try {
            return mapper.writeValueAsString(data);
        } catch (Exception e) {
            return String.valueOf(data);
        }
    }
}
