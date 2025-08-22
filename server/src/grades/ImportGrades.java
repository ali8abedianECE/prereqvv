package grades;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;

/**
 * Usage: java grades.ImportGrades --dir /path/to/ubc-pair-grade-data --out /abs/tmp/outdir
 *
 * Produces:
 *   out/grades_sections_import.csv
 *   out/grades_course_avg_import.csv
 *
 * Looks for CSVs that contain headers including at least:
 *   average, section, year, session, and subject/dept, course/number, campus
 * Header names are matched case-insensitively and synonym-aware.
 */
public class ImportGrades {

    static class SectionRow {
        String campus;
        String subject;
        String course;
        String section;
        String session;
        int year;
        Double average;
    }

    static final String[] SUBJECT_KEYS = {"subject", "dept", "department"};
    static final String[] COURSE_KEYS  = {"course", "number", "catalog", "catalog_number"};
    static final String[] CAMPUS_KEYS  = {"campus"};
    static final String[] SECTION_KEYS = {"section"};
    static final String[] YEAR_KEYS    = {"year"};
    static final String[] SESSION_KEYS = {"session", "term"};
    static final String[] AVG_KEYS     = {"average", "avg"};

    public static void main(String[] args) throws Exception {
        Map<String, String> a = parseArgs(args);
        String dir = a.getOrDefault("dir", "");
        String out = a.getOrDefault("out", "");

        if (dir.isEmpty()) {
            System.err.println("ERROR: --dir is required");
            System.exit(2);
        }
        if (out.isEmpty()) {
            out = Paths.get(System.getProperty("user.dir")).toAbsolutePath().toString();
        }
        Path inRoot = Paths.get(dir);
        Path outRoot = Paths.get(out);
        Files.createDirectories(outRoot);

        List<SectionRow> rows = new ArrayList<>();

        // scan recursively for .csv files
        try (var stream = Files.walk(inRoot)) {
            stream.filter(p -> Files.isRegularFile(p) && p.toString().toLowerCase().endsWith(".csv"))
                    .forEach(p -> readCsvFile(p, rows));
        }

        // write section CSV
        Path sectionsCsv = outRoot.resolve("grades_sections_import.csv");
        try (BufferedWriter w = Files.newBufferedWriter(sectionsCsv, StandardCharsets.UTF_8)) {
            w.write("campus,subject,course,section,year,session,average\n");
            for (SectionRow r : rows) {
                if (r.campus == null || r.subject == null || r.course == null || r.section == null || r.session == null || r.year == 0 || r.average == null) {
                    continue;
                }
                w.write(escape(r.campus)); w.write(",");
                w.write(escape(r.subject)); w.write(",");
                w.write(escape(r.course)); w.write(",");
                w.write(escape(r.section)); w.write(",");
                w.write(Integer.toString(r.year)); w.write(",");
                w.write(escape(r.session)); w.write(",");
                w.write(String.format(java.util.Locale.US, "%.4f", r.average));
                w.write("\n");
            }
        }

        // aggregate to course averages per (campus, subject, course)
        Map<String, Agg> agg = new LinkedHashMap<>();
        for (SectionRow r : rows) {
            if (r.campus == null || r.subject == null || r.course == null || r.average == null) continue;
            String key = (r.campus + "|" + r.subject + "|" + r.course).toUpperCase();
            agg.computeIfAbsent(key, k -> new Agg(r.campus, r.subject, r.course)).add(r.average);
        }

        Path courseCsv = outRoot.resolve("grades_course_avg_import.csv");
        try (BufferedWriter w = Files.newBufferedWriter(courseCsv, StandardCharsets.UTF_8)) {
            w.write("campus,subject,course,avg,samples\n");
            for (Agg g : agg.values()) {
                w.write(escape(g.campus)); w.write(",");
                w.write(escape(g.subject)); w.write(",");
                w.write(escape(g.course)); w.write(",");
                w.write(String.format(java.util.Locale.US, "%.4f", g.avg())); w.write(",");
                w.write(Integer.toString(g.n));
                w.write("\n");
            }
        }

        System.out.println("OK sections=" + rows.size() + " courses=" + agg.size());
        System.out.println("OUT " + sectionsCsv.toAbsolutePath());
        System.out.println("OUT " + courseCsv.toAbsolutePath());
    }

    static class Agg {
        final String campus, subject, course;
        double sum = 0.0;
        int n = 0;
        Agg(String campus, String subject, String course) {
            this.campus = campus; this.subject = subject; this.course = course;
        }
        void add(double v) { sum += v; n++; }
        double avg() { return n == 0 ? 0.0 : (sum / n); }
    }

    static void readCsvFile(Path p, List<SectionRow> out) {
        try (BufferedReader r = Files.newBufferedReader(p, StandardCharsets.UTF_8)) {
            String header = r.readLine();
            if (header == null) return;
            String[] cols = splitCsv(header);
            Map<String,Integer> idx = new HashMap<>();
            for (int i = 0; i < cols.length; i++) idx.put(cols[i].trim().toLowerCase(), i);

            Integer iSubj = firstIndex(idx, SUBJECT_KEYS);
            Integer iCourse = firstIndex(idx, COURSE_KEYS);
            Integer iCampus = firstIndex(idx, CAMPUS_KEYS);
            Integer iSection = firstIndex(idx, SECTION_KEYS);
            Integer iYear = firstIndex(idx, YEAR_KEYS);
            Integer iSession = firstIndex(idx, SESSION_KEYS);
            Integer iAvg = firstIndex(idx, AVG_KEYS);

            if (iCourse == null || iSubj == null || iAvg == null) {
                return; // not a grades CSV we know
            }

            String line;
            while ((line = r.readLine()) != null) {
                String[] f = splitCsv(line);
                SectionRow row = new SectionRow();
                row.subject = getField(f, iSubj);
                row.course = normalizeCourse(getField(f, iCourse));
                row.campus = getField(f, iCampus);
                row.section = getField(f, iSection);
                row.session = getField(f, iSession);
                row.year = parseInt(getField(f, iYear));
                row.average = parseDouble(getField(f, iAvg));
                out.add(row);
            }
        } catch (Exception ex) {
            // ignore file-level errors; continue scanning
        }
    }

    static String normalizeCourse(String s) {
        if (s == null) return null;
        s = s.trim();
        // keep just the number part for consistency (e.g., "211" or "211A")
        return s;
    }

    static String[] splitCsv(String line) {
        // minimal CSV splitter (no quotes handling). Works for the PAIR CSVs which are simple.
        return line.split(",", -1);
    }

    static Integer firstIndex(Map<String,Integer> idx, String[] keys) {
        for (String k : keys) {
            Integer i = idx.get(k);
            if (i != null) return i;
        }
        return null;
    }

    static String getField(String[] f, Integer i) {
        if (i == null) return null;
        if (i < 0 || i >= f.length) return null;
        String v = f[i];
        if (v == null) return null;
        v = v.trim();
        return v.isEmpty() ? null : v;
    }

    static int parseInt(String s) {
        try { return Integer.parseInt(s); } catch (Exception e) { return 0; }
    }

    static Double parseDouble(String s) {
        try { return Double.valueOf(s); } catch (Exception e) { return null; }
    }

    static String escape(String s) {
        if (s == null) return "";
        // bare CSV, fields we produce have no commas
        return s;
    }

    static Map<String,String> parseArgs(String[] args) {
        Map<String,String> m = new HashMap<>();
        for (int i=0; i<args.length; i++) {
            if (args[i].equals("--dir") && i+1<args.length) m.put("dir", args[++i]);
            else if (args[i].equals("--out") && i+1<args.length) m.put("out", args[++i]);
        }
        return m;
    }
}
