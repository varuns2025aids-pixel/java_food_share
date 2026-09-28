package com.example.java_practical.service;

import com.example.java_practical.entity.food_entity.*;
import com.example.java_practical.repository.food_repository.*;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class food_service {

    private static final Set<String> ALLOWED_SORTS =
            Set.of("safeUntil", "quantity", "status", "id");

    private final DonorRepo donorRepo;
    private final NgoRepo ngoRepo;
    private final ListingRepo listingRepo;
    private final ClaimRepo claimRepo;

    public food_service(DonorRepo donorRepo, NgoRepo ngoRepo,
                        ListingRepo listingRepo, ClaimRepo claimRepo) {
        this.donorRepo = donorRepo;
        this.ngoRepo = ngoRepo;
        this.listingRepo = listingRepo;
        this.claimRepo = claimRepo;
    }

    public record ListingDetails(
            Long id,
            Long donorId,
            String donorName,
            String donorContact,
            String foodType,
            Double quantity,
            LocalDateTime safeUntil,
            ListingStatus status,
            LocalDateTime collectedAt,
            String ngoName,
            String ngoContact) {}

    // ---------- Donors & NGOs ----------
    public Donor addDonor(Donor donor) { return donorRepo.save(donor); }

    public List<Donor> getDonors() { return donorRepo.findAll(); }

    @Transactional
    public Donor updateDonor(Long id, Donor updated) {
        Donor existing = donorRepo.findById(id)
                .orElseThrow(() -> new NotFoundException("Donor " + id + " not found"));
        existing.name = updated.name;
        existing.contact = updated.contact;
        Donor saved = donorRepo.save(existing);
        notifyUser("Donor #" + id + " updated: " + saved.name);
        return saved;
    }

    @Transactional
    public void deleteDonor(Long id) {
        Donor donor = donorRepo.findById(id)
                .orElseThrow(() -> new NotFoundException("Donor " + id + " not found"));
        try {
            donorRepo.delete(donor);
            donorRepo.flush();
        } catch (Exception e) {
            throw new BusinessException("Cannot delete donor #" + id + " because they have associated food listings");
        }
    }

    public NGO addNgo(NGO ngo) { return ngoRepo.save(ngo); }

    public List<NGO> getNgos() { return ngoRepo.findAll(); }

    @Transactional
    public NGO updateNgo(Long id, NGO updated) {
        NGO existing = ngoRepo.findById(id)
                .orElseThrow(() -> new NotFoundException("NGO " + id + " not found"));
        existing.name = updated.name;
        existing.contact = updated.contact;
        NGO saved = ngoRepo.save(existing);
        notifyUser("NGO #" + id + " updated: " + saved.name);
        return saved;
    }

    @Transactional
    public void deleteNgo(Long id) {
        NGO ngo = ngoRepo.findById(id)
                .orElseThrow(() -> new NotFoundException("NGO " + id + " not found"));
        try {
            ngoRepo.delete(ngo);
            ngoRepo.flush();
        } catch (Exception e) {
            throw new BusinessException("Cannot delete NGO #" + id + " because it has associated claims");
        }
    }

    // ---------- 1. Donor lists surplus food ----------
    public FoodListing addListing(Long donorId, String foodType, Double quantity, LocalDateTime safeUntil) {
        Donor donor = donorRepo.findById(donorId)
                .orElseThrow(() -> new NotFoundException("Donor " + donorId + " not found"));
        FoodListing l = new FoodListing();
        l.donor = donor;
        l.foodType = foodType;
        l.quantity = quantity;
        l.safeUntil = safeUntil;
        return listingRepo.save(l);
    }

    @Transactional
    public FoodListing updateListing(Long id, Long donorId, String foodType,
                                     Double quantity, LocalDateTime safeUntil) {
        FoodListing listing = listingRepo.findById(id)
                .orElseThrow(() -> new NotFoundException("Listing " + id + " not found"));
        Donor donor = donorRepo.findById(donorId)
                .orElseThrow(() -> new NotFoundException("Donor " + donorId + " not found"));
        listing.donor = donor;
        listing.foodType = foodType;
        listing.quantity = quantity;
        listing.safeUntil = safeUntil;
        return listingRepo.save(listing);
    }

    @Transactional
    public void deleteListing(Long id) {
        FoodListing listing = listingRepo.findById(id)
                .orElseThrow(() -> new NotFoundException("Listing " + id + " not found"));
        claimRepo.deleteByListing(listing);
        listingRepo.delete(listing);
    }

    // ---------- 2. Browse with pagination & sorting ----------
    public List<ListingDetails> getListings(int page, int size, String sortBy) {
        if (!ALLOWED_SORTS.contains(sortBy)) {
            throw new IllegalArgumentException("Invalid sort field: " + sortBy + ". Allowed: " + ALLOWED_SORTS);
        }
        autoExpire(); // expire any passed-safeUntil listings before returning
        return listingRepo.findAll(PageRequest.of(page, size, Sort.by(sortBy).ascending()))
                .stream().map(this::listingDetails).toList();
    }

    private ListingDetails listingDetails(FoodListing listing) {
        Claim latestClaim = claimRepo.findTopByListingOrderByClaimedAtDesc(listing).orElse(null);
        return new ListingDetails(listing.id, listing.donor.id, listing.donor.name,
                listing.donor.contact, listing.foodType, listing.quantity, listing.safeUntil,
                listing.status, listing.collectedAt,
                latestClaim == null ? null : latestClaim.ngo.name,
                latestClaim == null ? null : latestClaim.ngo.contact);
    }

    // ---------- 2. NGO claims listing ----------
    // Concurrency safe: Pessimistic write lock guarantees only ONE claim succeeds
    @Transactional
    public Claim claim(Long listingId, Long ngoId) {
        FoodListing l = listingRepo.findForUpdate(listingId)
                .orElseThrow(() -> new NotFoundException("Listing " + listingId + " not found"));

        if (l.safeUntil.isBefore(LocalDateTime.now())) {
            l.status = ListingStatus.EXPIRED;
            listingRepo.save(l);
            throw new BusinessException("Listing #" + listingId + " has expired and cannot be claimed");
        }
        if (l.status != ListingStatus.AVAILABLE) {
            throw new BusinessException("Listing #" + listingId + " is not available (status: " + l.status + ")");
        }

        NGO ngo = ngoRepo.findById(ngoId)
                .orElseThrow(() -> new NotFoundException("NGO " + ngoId + " not found"));

        l.status = ListingStatus.CLAIMED;
        listingRepo.save(l);

        Claim c = new Claim();
        c.listing = l;
        c.ngo = ngo;
        c.claimedAt = LocalDateTime.now();
        Claim saved = claimRepo.save(c);

        notifyUser("Claim created for Listing #" + l.id + " by NGO: " + ngo.name);
        return saved;
    }

    // ---------- 3. Mark listing as collected ----------
    @Transactional
    public FoodListing collect(Long listingId) {
        FoodListing l = listingRepo.findForUpdate(listingId)
                .orElseThrow(() -> new NotFoundException("Listing " + listingId + " not found"));
        if (l.status != ListingStatus.CLAIMED) {
            throw new BusinessException("Only a claimed listing can be collected (current status: " + l.status + ")");
        }
        Claim c = claimRepo.findByListingAndStatus(l, ClaimStatus.ACTIVE)
                .orElseThrow(() -> new BusinessException("No active claim found for this listing"));
        c.status = ClaimStatus.COLLECTED;
        l.status = ListingStatus.COLLECTED;
        l.collectedAt = LocalDateTime.now();
        claimRepo.save(c);
        FoodListing saved = listingRepo.save(l);
        notifyUser("Listing #" + l.id + " collected by " + c.ngo.name);
        return saved;
    }

    // ---------- 4. Background job: auto-expire every 30s ----------
    @Scheduled(fixedRate = 30000)
    @Transactional
    public void autoExpire() {
        List<FoodListing> expired = listingRepo
                .findByStatusAndSafeUntilBefore(ListingStatus.AVAILABLE, LocalDateTime.now());
        for (FoodListing l : expired) {
            l.status = ListingStatus.EXPIRED;
            listingRepo.save(l);
            notifyUser("Listing #" + l.id + " (" + l.foodType + ") has expired");
        }
    }

    // ---------- 5. Monthly total food diverted from waste ----------
    public Map<String, Object> monthlyReport(int year, int month) {
        if (month < 1 || month > 12) throw new IllegalArgumentException("month must be between 1 and 12");
        LocalDateTime start = LocalDate.of(year, month, 1).atStartOfDay();
        LocalDateTime end = start.plusMonths(1);
        Double total = listingRepo.totalCollected(ListingStatus.COLLECTED, start, end);
        List<FoodListing> collected = listingRepo.findCollectedBetween(ListingStatus.COLLECTED, start, end);
        List<ListingDetails> details = collected.stream().map(this::listingDetails).toList();
        return Map.of(
                "year", year,
                "month", month,
                "totalFoodDivertedKg", total == null ? 0.0 : total,
                "collectedCount", collected.size(),
                "listings", details
        );
    }

    // ---------- 6. Notifications (simple console logger) ----------
    private void notifyUser(String msg) {
        System.out.println("[NOTIFICATION] " + msg);
    }

    public List<Claim> getClaims() { return claimRepo.findAll(); }

    // Custom runtime exceptions
    public static class NotFoundException extends RuntimeException {
        public NotFoundException(String msg) { super(msg); }
    }
    public static class BusinessException extends RuntimeException {
        public BusinessException(String msg) { super(msg); }
    }
}
