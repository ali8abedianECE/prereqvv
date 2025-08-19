import unittest, json
import extractor_v2 as ex

class TestExtractorV2(unittest.TestCase):
    def test_extract_codes(self):
        s = "Prerequisite: MATH 101 and one of PHYS_V 108, PHYS 118 or PHYS 158."
        self.assertEqual(
            ex.extract_codes(s),
            ["MATH 101","PHYS_V 108","PHYS 118","PHYS 158"]
        )

    def test_build_tree_one_of_and_coreq(self):
        s = "Prerequisite: MATH 101 and one of PHYS 108, PHYS 118, PHYS 158. Corequisite: one of MATH 255, MATH 256."
        clean = ex.sanitize_for_tree(s)
        tree = ex.build_tree_from_text(clean)
        self.assertIsInstance(tree, dict)
        self.assertEqual(tree.get("op"), "AND")
        kids = tree.get("children", [])
        self.assertTrue(any(k.get("type")=="course" and k["id"]=="MATH 101" for k in kids))
        or_nodes = [k for k in kids if isinstance(k,dict) and k.get("op")=="OR"]
        self.assertTrue(any(any(c.get("id")=="PHYS 118" for c in n.get("children",[])) for n in or_nodes))

    def test_strip_self_refs(self):
        t = {"op":"AND","children":[{"type":"course","id":"ELEC 201"}, {"type":"course","id":"MATH 101"}]}
        out = ex.strip_self_refs(t, "ELEC 201")
        self.assertIsInstance(out, dict)
        ids = [c["id"] for c in out["children"] if c.get("type")=="course"]
        self.assertNotIn("ELEC 201", ids)
        self.assertIn("MATH 101", ids)

    def test_credit_pairs_detect(self):
        s = "Credit will be granted for only one of PHIL_V 100 or PHIL_V 102."
        pairs = ex.extract_credit_groups(s)
        self.assertEqual(len(pairs), 1)
        self.assertCountEqual(pairs[0]["courses"], ["PHIL_V 100","PHIL_V 102"])

    def test_classify_logic(self):
        self.assertEqual(ex.classify_logic("one of A, B, C."), "OR")
        self.assertEqual(ex.classify_logic("A and B."), "AND")
        self.assertIn(ex.classify_logic("A and one of B, C."), ("MIXED","AND","OR"))

if __name__ == "__main__":
    unittest.main()
