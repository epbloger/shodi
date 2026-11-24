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
            ("example-id", "Test museum", "museum", "museum", [], .9, "Test street", "Москва", 55.75, 37.61, [{"dataset":"Meta, Overture"}], "open"),
            ("other-id", "Unlicensed example", "museum", "museum", [], .9, "Test street", "Москва", 55.75, 37.61, [{"dataset":"Foursquare, Overture"}], "open"),
        ]
        result = mod.make_catalog(rows)
        self.assertEqual(len(result["msk"]), 1)
        self.assertEqual(result["msk"][0][1], "Test museum")

    def test_no_city_cap_and_distinct_branches(self):
        rows = [(str(i), "Same coffee chain", "cafe", "cafe", [], .9, f"Street {i}", "Москва", 55.75, 37.61, [{"dataset":"Meta, Overture"}], "open") for i in range(100)]
        rows.append(("duplicate", "Same coffee chain", "cafe", "cafe", [], .7, "Street 0", "Москва", 55.75, 37.61, [{"dataset":"Meta, Overture"}], "open"))
        rows.append(("museum", "Museum", "museum", "museum", [], .7, "Museum street", "Москва", 55.75, 37.61, [{"dataset":"Meta, Overture"}], "open"))
        result = mod.make_catalog(rows)["msk"]
        self.assertEqual(len(result), 101)
        self.assertEqual({entry[2] for entry in result[:2]}, {"coffee", "museum"})
        self.assertEqual(len({entry[0] for entry in result}), 101)

    def test_closed_and_specific_categories(self):
        self.assertEqual(mod.classify("Театр драмы", "concert_hall", "theatre", []), "theater")
        self.assertEqual(mod.classify("Смотровая площадка", "landmark", "landmark", []), "view")
        self.assertNotEqual(mod.classify("Кинотеатр Мир", "movie_theater", "movie_theater", []), "theater")
        src = [{"dataset": "Meta, Overture"}]
        rows = [
            ("a", "Театр драмы", "concert_hall", "theatre", [], .9, "Street 1", "Москва", 55.75, 37.61, src, "open"),
            ("b", "Смотровая площадка", "landmark", "landmark", [], .9, "Street 2", "Москва", 55.75, 37.61, src, None),
            ("c", "Кафе", "cafe", "cafe", [], .9, "Street 3", "Москва", 55.75, 37.61, src, "open"),
            ("d", "Кафе", "cafe", "cafe", [], 0, "Street 3", "Москва", 55.75, 37.61, src, "permanently_closed"),
            ("e", "Закрыто навсегда", "cafe", "cafe", [], .9, "Street 4", "Москва", 55.75, 37.61, src, None),
            ("f", "Кафе 2", "cafe", "cafe", [], .9, "Street 5", "Москва", 55.75, 37.61, src, "temporarily_closed"),
        ]
        result = mod.make_catalog(rows)["msk"]
        self.assertEqual({entry[2] for entry in result}, {"theater", "view"})
        self.assertEqual({entry[6] for entry in result}, {"open", "unknown"})

if __name__ == "__main__":
    unittest.main()
