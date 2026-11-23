package com.stem.cvppmk.docs;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.*;

/** Retail fields come from the checked-in, verified Service Layer metadata, never client input. */
final class SetupRetailPolicy {
    private SetupRetailPolicy() { }

    static void validateKey(JsonNode step, JsonNode row) {
        if (!"update".equals(row.path("action").asText())) return;
        String key = row.path("key").asText();
        if (key.trim().isEmpty()) throw new IllegalArgumentException("Key Retail tujuan wajib diisi");
        if (!step.path("keyString").asBoolean()) {
            try {
                if (!key.matches("-?\\d+")) throw new NumberFormatException();
                Integer.parseInt(key);
            } catch (NumberFormatException e) { throw new IllegalArgumentException("Key Retail tujuan harus Edm.Int32"); }
        }
    }

    static void validate(JsonNode step, ObjectNode data, boolean create) {
        Set<String> fields = new HashSet<>();
        step.path("fields").forEach(f -> fields.add(f.asText()));
        Map<String, JsonNode> children = new HashMap<>();
        step.path("children").forEach(c -> children.put(c.path("collection").asText(), c));
        data.fields().forEachRemaining(e -> {
            JsonNode child = children.get(e.getKey());
            if (child != null) {
                if (!create) throw new IllegalArgumentException("Detail Route lama tidak dapat diubah melalui upload; ubah di SAP");
                if (!e.getValue().isArray()) throw new IllegalArgumentException("Detail Route harus berupa array JSON");
                for (JsonNode row : e.getValue()) {
                    if (!row.isObject()) throw new IllegalArgumentException("Baris detail Route harus berupa objek JSON");
                    row.fields().forEachRemaining(f -> validateField(child.path("fieldTypes"), f.getKey(), f.getValue()));
                }
            } else {
                if (!fields.contains(e.getKey())) throw new IllegalArgumentException("Field Retail tidak terverifikasi: " + e.getKey());
                if (!create && step.path("keyField").asText().equals(e.getKey()))
                    throw new IllegalArgumentException("Key Retail tidak dapat diubah");
                if (create) for (JsonNode omit : step.path("omitOnCreate"))
                    if (omit.asText().equals(e.getKey())) throw new IllegalArgumentException(e.getKey() + " dibuat otomatis oleh SAP; jangan dikirim");
                validateField(step.path("fieldTypes"), e.getKey(), e.getValue());
            }
        });
        if (create && "stem-ruletransfer".equals(step.path("id").asText())) {
            boolean any = false;
            for (JsonNode f : step.path("match")) any |= !SetupBranchPolicy.empty(data.get(f.asText()));
            if (!any) throw new IllegalArgumentException("Minimal satu field aturan transfer wajib diisi");
        }
    }

    private static void validateField(JsonNode types, String field, JsonNode value) {
        String type = types.path(field).asText();
        if (type.isEmpty()) throw new IllegalArgumentException("Field Retail tidak terverifikasi: " + field);
        if (value.isNull()) return;
        boolean valid = "Edm.String".equals(type) ? value.isTextual()
            : "Edm.Int32".equals(type) ? value.isIntegralNumber() && value.canConvertToInt()
            : "Edm.Double".equals(type) && value.isNumber() && Double.isFinite(value.asDouble());
        if (!valid) throw new IllegalArgumentException("Tipe field " + field + " harus " + type);
    }

    /** Join by header Code, retain SQL LineId ordering, serialize only verified child UDFs. */
    @SuppressWarnings("unchecked")
    static void attachDetails(Map<String,Object> headers, Map<String,Object> details, JsonNode child, ObjectMapper json) {
        List<String> columns = (List<String>) headers.get("columns");
        List<String> detailColumns = (List<String>) details.get("columns");
        Map<String,List<Map<String,Object>>> byCode = new LinkedHashMap<>();
        for (List<String> row : (List<List<String>>) details.get("rows")) {
            Map<String,Object> item = new LinkedHashMap<>();
            for (JsonNode f : child.path("fields")) {
                String field = f.asText(), value = row.get(detailColumns.indexOf(field));
                if (value == null) continue;
                item.put(field, "Edm.Int32".equals(child.path("fieldTypes").path(field).asText()) ? (Object)Integer.valueOf(value) : value);
            }
            byCode.computeIfAbsent(row.get(detailColumns.indexOf("_parent")), k -> new ArrayList<>()).add(item);
        }
        int code = columns.indexOf("Code");
        columns.add(child.path("from").asText());
        for (List<String> row : (List<List<String>>) headers.get("rows")) {
            try { row.add(json.writeValueAsString(byCode.getOrDefault(row.get(code), Collections.emptyList()))); }
            catch (java.io.IOException e) { throw new IllegalStateException("Detail Route tidak dapat dibaca", e); }
        }
    }
}
