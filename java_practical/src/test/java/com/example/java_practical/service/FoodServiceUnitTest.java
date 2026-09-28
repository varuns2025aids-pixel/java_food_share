package com.example.java_practical.service;

import com.example.java_practical.entity.food_entity.*;
import com.example.java_practical.repository.food_repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class FoodServiceUnitTest {

    @Mock
    private DonorRepo donorRepo;

    @Mock
    private NgoRepo ngoRepo;

    @Mock
    private ListingRepo listingRepo;

    @Mock
    private ClaimRepo claimRepo;

    private food_service service;

    @BeforeEach
    void setUp() {
        service = new food_service(donorRepo, ngoRepo, listingRepo, claimRepo);
    }

    @Test
    void testUpdateDonor_Success() {
        Donor existing = new Donor();
        existing.id = 1L;
        existing.name = "Old Donor";
        existing.contact = "1111111111";

        when(donorRepo.findById(1L)).thenReturn(Optional.of(existing));
        when(donorRepo.save(any(Donor.class))).thenAnswer(invocation -> invocation.getArgument(0));

        Donor updatedInfo = new Donor();
        updatedInfo.name = "Updated Donor";
        updatedInfo.contact = "9999999999";

        Donor result = service.updateDonor(1L, updatedInfo);

        assertEquals("Updated Donor", result.name);
        assertEquals("9999999999", result.contact);
        verify(donorRepo).save(existing);
    }

    @Test
    void testUpdateNgo_Success() {
        NGO existing = new NGO();
        existing.id = 1L;
        existing.name = "Old NGO";
        existing.contact = "2222222222";

        when(ngoRepo.findById(1L)).thenReturn(Optional.of(existing));
        when(ngoRepo.save(any(NGO.class))).thenAnswer(invocation -> invocation.getArgument(0));

        NGO updatedInfo = new NGO();
        updatedInfo.name = "Updated NGO";
        updatedInfo.contact = "8888888888";

        NGO result = service.updateNgo(1L, updatedInfo);

        assertEquals("Updated NGO", result.name);
        assertEquals("8888888888", result.contact);
        verify(ngoRepo).save(existing);
    }

    @Test
    void testListingsReflectUpdatedDonorAndNgo() {
        Donor donor = new Donor();
        donor.id = 1L;
        donor.name = "Updated Donor Name";
        donor.contact = "9999999999";

        NGO ngo = new NGO();
        ngo.id = 2L;
        ngo.name = "Updated NGO Name";
        ngo.contact = "8888888888";

        FoodListing listing = new FoodListing();
        listing.id = 10L;
        listing.donor = donor;
        listing.foodType = "Rice";
        listing.quantity = 15.0;
        listing.safeUntil = LocalDateTime.now().plusHours(4);
        listing.status = ListingStatus.CLAIMED;

        Claim claim = new Claim();
        claim.id = 100L;
        claim.listing = listing;
        claim.ngo = ngo;
        claim.status = ClaimStatus.ACTIVE;
        claim.claimedAt = LocalDateTime.now();

        when(listingRepo.findByStatusAndSafeUntilBefore(any(), any())).thenReturn(List.of());
        when(listingRepo.findAll(any(Pageable.class))).thenReturn(new PageImpl<>(List.of(listing)));
        when(claimRepo.findTopByListingOrderByClaimedAtDesc(listing)).thenReturn(Optional.of(claim));

        List<food_service.ListingDetails> details = service.getListings(0, 10, "id");

        assertNotNull(details);
        assertEquals(1, details.size());
        food_service.ListingDetails item = details.get(0);
        assertEquals("Updated Donor Name", item.donorName());
        assertEquals("9999999999", item.donorContact());
        assertEquals("Updated NGO Name", item.ngoName());
        assertEquals("8888888888", item.ngoContact());
    }

    @Test
    void testMonthlyReport_Success() {
        Donor donor = new Donor();
        donor.id = 1L;
        donor.name = "Bakery";
        donor.contact = "1122334455";

        NGO ngo = new NGO();
        ngo.id = 2L;
        ngo.name = "Food Bank";
        ngo.contact = "9988776655";

        FoodListing listing = new FoodListing();
        listing.id = 5L;
        listing.donor = donor;
        listing.foodType = "Bread";
        listing.quantity = 8.0;
        listing.safeUntil = LocalDateTime.of(2026, 9, 20, 18, 0);
        listing.status = ListingStatus.COLLECTED;
        listing.collectedAt = LocalDateTime.of(2026, 9, 20, 15, 0);

        Claim claim = new Claim();
        claim.id = 50L;
        claim.listing = listing;
        claim.ngo = ngo;
        claim.status = ClaimStatus.COLLECTED;

        when(listingRepo.totalCollected(eq(ListingStatus.COLLECTED), any(LocalDateTime.class), any(LocalDateTime.class)))
                .thenReturn(8.0);
        when(listingRepo.findCollectedBetween(eq(ListingStatus.COLLECTED), any(LocalDateTime.class), any(LocalDateTime.class)))
                .thenReturn(List.of(listing));
        when(claimRepo.findTopByListingOrderByClaimedAtDesc(listing)).thenReturn(Optional.of(claim));

        Map<String, Object> report = service.monthlyReport(2026, 9);

        assertEquals(2026, report.get("year"));
        assertEquals(9, report.get("month"));
        assertEquals(8.0, report.get("totalFoodDivertedKg"));
        assertEquals(1, report.get("collectedCount"));
        assertNotNull(report.get("listings"));
    }

    @Test
    void testMonthlyReport_NoDataReturnsZero() {
        when(listingRepo.totalCollected(eq(ListingStatus.COLLECTED), any(LocalDateTime.class), any(LocalDateTime.class)))
                .thenReturn(null);
        when(listingRepo.findCollectedBetween(eq(ListingStatus.COLLECTED), any(LocalDateTime.class), any(LocalDateTime.class)))
                .thenReturn(List.of());

        Map<String, Object> report = service.monthlyReport(2026, 9);

        assertEquals(0.0, report.get("totalFoodDivertedKg"));
        assertEquals(0, report.get("collectedCount"));
        assertTrue(((List<?>) report.get("listings")).isEmpty());
    }

    @Test
    void testMonthlyReport_InvalidMonthThrows() {
        assertThrows(IllegalArgumentException.class, () -> service.monthlyReport(2026, 0));
        assertThrows(IllegalArgumentException.class, () -> service.monthlyReport(2026, 13));
    }
}
