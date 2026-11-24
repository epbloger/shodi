import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("import_overture", Path(__file__).resolve().parents[1] / "scripts/import-overture.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class ImportTests(unittest.TestCase):
    def test_dataset_and_provider_names(self):
        for label in ["Meta", "Meta, Overture", "Microsoft, Overture", "AllThePlaces, Overture", "OpenTravel, Overture", "meta/places"]:
            self.assertTrue(mod.permitted_sources([{"dataset": label}]), label)
        self.assertTrue(mod.permitted_sources([{"dataset": "Overture"}, {"provider": "meta", "dataset": "Meta, Overture"}]))
        self.assertFalse(mod.permitted_sources([{"dataset": "Foursquare, Overture"}]))
        self.assertFalse(mod.permitted_sources([{"dataset": "Meta, Foursquare, Overture"}]))
        self.assertFalse(mod.permitted_sources([{"dataset": "Unknown"}]))
        self.assertFalse(mod.permitted_sources([{"dataset": "Overture"}]))
        self.assertFalse(mod.permitted_sources([]))

    def test_catalog_with_realistic_source_labels(self):
        rows = [
            ("example-id", "Test museum", "museum", "museum", [], .9, "Test street", "Москва", 55.75, 37.61, [{"dataset":"Meta, Overture"}]),
            ("other-id", "Unlicensed example", "museum", "museum", [], .9, "Test street", "Москва", 55.75, 37.61, [{"dataset":"Foursquare, Overture"}]),
        ]
        result = mod.make_catalog(rows)
        self.assertEqual(len(result["msk"]), 1)
        self.assertEqual(result["msk"][0][1], "Test museum")

if __name__ == "__main__":
    unittest.main()
