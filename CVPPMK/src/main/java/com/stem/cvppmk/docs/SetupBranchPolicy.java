package com.stem.cvppmk.docs;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;

/** Shared rules for Setup only. Zero is a value, never a wildcard for all branches. */
final class SetupBranchPolicy {
    private SetupBranchPolicy() { }

    static boolean parseMode(String flag) {
        if ("Y".equals(flag)) return true;
        if ("N".equals(flag)) return false;
        throw new IllegalStateException("Flag OADM.MltpBrnchs tujuan tidak dikenal. Upload diblokir.");
    }

    static boolean branchField(String field) {
        String key = field.toLowerCase(Locale.ROOT);
        return key.contains("branch") || key.contains("bpl") || key.contains("businessplace");
    }

    static boolean empty(JsonNode value) {
        return value == null || value.isNull() || value.isMissingNode()
                || (value.isTextual() && value.asText().trim().isEmpty());
    }

    /** Reject meaningful branch input; strip even empty/null branch properties recursively before SL. */
    static void withoutBranches(JsonNode node) {
        if (node.isArray()) { for (JsonNode child : node) withoutBranches(child); return; }
        if (!node.isObject()) return;
        ObjectNode obj = (ObjectNode) node;
        List<String> remove = new ArrayList<>();
        Iterator<String> fields = obj.fieldNames();
        while (fields.hasNext()) {
            String field = fields.next();
            JsonNode value = obj.get(field);
            if (branchField(field)) {
                if (!empty(value) && !(value.isContainerNode() && value.size() == 0))
                    throw new IllegalArgumentException("Field " + field + " tidak berlaku: company tujuan tidak memakai branch. Kosongkan input branch.");
                remove.add(field);
            } else withoutBranches(value);
        }
        for (String field : remove) obj.remove(field);
    }
}
