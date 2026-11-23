package com.stem.cvppmk.docs;

import java.util.*;

/** Company-selected mapping overlays legacy categories; no connection or SQL access. */
final class AddonMapping {
    private AddonMapping() {}
    @SuppressWarnings("unchecked")
    static Map<String,Object> normalize(Map<String,Object> current, Map<String,Object> defaults) {
        if(defaults.isEmpty())return current; // preserve CV mapping, including custom categories
        Set<Object> legacy=new HashSet<>((List<Object>)defaults.getOrDefault("legacyCategories",Collections.emptyList()));
        Set<Object> cats=new LinkedHashSet<>((List<Object>)defaults.getOrDefault("categories",Collections.emptyList()));
        for(Object c:(List<Object>)current.getOrDefault("categories",Collections.emptyList()))if(!legacy.contains(c))cats.add(c);
        Map<String,Object> objects=new LinkedHashMap<>();
        Map<String,Map<String,Object>> baseline=(Map<String,Map<String,Object>>)defaults.getOrDefault("objects",Collections.emptyMap());
        for(Map.Entry<String,Map<String,Object>> e:((Map<String,Map<String,Object>>)current.getOrDefault("objects",Collections.emptyMap())).entrySet()) {
            Map<String,Object> obj=new LinkedHashMap<>(e.getValue()==null?Collections.emptyMap():e.getValue());
            if(legacy.contains(obj.get("cat")))obj.remove("cat");
            objects.put(e.getKey(),obj);
        }
        for(Map.Entry<String,Map<String,Object>> e:baseline.entrySet()) {
            Map<String,Object> obj=new LinkedHashMap<>((Map<String,Object>)objects.getOrDefault(e.getKey(),Collections.emptyMap()));
            for(Map.Entry<String,Object> field:e.getValue().entrySet())
                if("cat".equals(field.getKey())||!obj.containsKey(field.getKey()))obj.put(field.getKey(),field.getValue());
            objects.put(e.getKey(),obj);
        }
        Map<String,Object> out=new LinkedHashMap<>();out.put("categories",new ArrayList<>(cats));out.put("objects",objects);
        out.put("rules",defaults.getOrDefault("rules",Collections.emptyList()));return out;
    }
    @SuppressWarnings("unchecked")
    static Map<String,Object> object(Map<String,Object> mapping, String code, List<String> tables) {
        Map<String,Object> out=new LinkedHashMap<>();
        List<String> names=new ArrayList<>(tables);names.add(code);
        for(Map<String,Object> rule:(List<Map<String,Object>>)mapping.getOrDefault("rules",Collections.emptyList())) {
            boolean matches=false;
            for(String prefix:(List<String>)rule.getOrDefault("prefixes",Collections.emptyList()))
                for(String name:names)if(name!=null&&name.toUpperCase(Locale.ROOT).startsWith(prefix.toUpperCase(Locale.ROOT)))matches=true;
            if(matches){out.putAll(rule);out.remove("prefixes");break;}
        }
        boolean hidden=Boolean.TRUE.equals(out.get("hide"));
        Map<String,Map<String,Object>> objects=(Map<String,Map<String,Object>>)mapping.getOrDefault("objects",Collections.emptyMap());
        Map<String,Object> explicit=objects.get(code);
        if(explicit!=null)out.putAll(explicit);
        if(hidden)out.put("hide",true);return out;
    }
}
